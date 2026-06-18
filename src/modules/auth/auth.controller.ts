import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Version,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthenticatedUser } from './decorators/authenticated-user.decorator';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from './guards/authenticated-user.guard';
import { authClientProfileFromAccessTokenIdentity } from './mappers/auth-client-profile-from-identity';
import type { AuthClientProfileResponseBody } from './types/auth-client-profile.types';
import type { User } from './types/user.types';
import { tgUserToTelegramAccessIdentity } from '../telegram/mappers/access-token-user.mapper';
import { AuthenticationService } from './authentication.service';
import { AuthorizationService } from './authorization.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly authenticationService: AuthenticationService,
  ) {}

  /**
   * Returns the current session profile from the access JWT cookie (for client gates and UI bootstrap).
   * TODO: do we need to check from server cache - not just from JWT, cause it can be unactual.
   */
  @Version('1')
  @Get('me')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard)
  me(@AuthenticatedUser() user: User): AuthClientProfileResponseBody {
    const identity = tgUserToTelegramAccessIdentity(user.tgUser);
    return {
      profile: authClientProfileFromAccessTokenIdentity(identity, user.isAdmin),
    };
  }

  /**
   * Issues new access + refresh cookies from a valid refresh cookie (rotation).
   */
  @Version('1')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthClientProfileResponseBody> {
    const refreshName = this.authenticationService.getRefreshCookieName();
    const token = req.cookies?.[refreshName]?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const verified = await this.authorizationService.verifyRefreshToken(token);
    const accessToken = await this.authenticationService.signAccessToken(
      verified.identity,
    );
    const newRefresh = await this.authenticationService.signRefreshToken(
      verified.identity,
    );
    this.authenticationService.setAccessTokenCookie(
      res,
      accessToken,
      this.authenticationService.getAccessExpiresInSeconds(),
    );
    this.authenticationService.setRefreshTokenCookie(
      res,
      newRefresh,
      this.authenticationService.getRefreshExpiresInSeconds(),
    );
    return {
      profile: authClientProfileFromAccessTokenIdentity(
        verified.identity,
        verified.isAdmin,
      ),
    };
  }

  /**
   * Clears HttpOnly access and refresh cookies (e.g. sign-out in the browser).
   */
  @Version('1')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.authenticationService.clearAllAuthCookies(res);
  }
}
