import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Version,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationService } from '../auth/authentication.service';
import { TelegramAccessExchangeService } from './telegram-access-exchange.service';
import { TelegramInitDataAuthService } from './telegram-init-data-auth.service';
import { TelegramOidcAuthService } from './telegram-oidc-auth.service';
import type { V1TelegramExchangeResponseBody } from './types/requests/v1-telegram-exchange-response';
import { V1TelegramWebAppBodyDto } from './types/requests/v1-telegram-web-app-body';
import { V1TelegramOidcBodyDto } from './types/requests/v1-telegram-oidc-body';

@Controller('auth')
export class TelegramAuthController {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly telegramAccessExchangeService: TelegramAccessExchangeService,
    private readonly telegramInitDataAuthService: TelegramInitDataAuthService,
    private readonly telegramOidcAuthService: TelegramOidcAuthService,
  ) {}

  /** Browser: exchange a verified Telegram OIDC ID token for the application session. */
  @Version('1')
  @Post('telegram/oidc')
  @HttpCode(HttpStatus.OK)
  async exchangeOidc(
    @Body() body: V1TelegramOidcBodyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<V1TelegramExchangeResponseBody> {
    const user = await this.telegramOidcAuthService.resolveUserFromIdToken(
      body.idToken,
    );
    const exchange =
      await this.telegramAccessExchangeService.buildAccessTokenExchange(user);
    this.authenticationService.setAccessTokenCookie(
      res,
      exchange.accessToken,
      exchange.accessExpiresIn,
    );
    this.authenticationService.setRefreshTokenCookie(
      res,
      exchange.refreshToken,
      exchange.refreshExpiresIn,
    );
    return { profile: exchange.profile };
  }

  /**
   * Mini App: exchange validated Web App `initData` (JSON body) for an access JWT.
   */
  @Version('1')
  @Post('telegram/web-app')
  @HttpCode(HttpStatus.OK)
  async exchangeWebApp(
    @Body() body: V1TelegramWebAppBodyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<V1TelegramExchangeResponseBody> {
    const user =
      await this.telegramInitDataAuthService.resolveUserFromInitDataString(
        body.initData,
      );
    const exchange =
      await this.telegramAccessExchangeService.buildAccessTokenExchange(user);
    this.authenticationService.setAccessTokenCookie(
      res,
      exchange.accessToken,
      exchange.accessExpiresIn,
    );
    this.authenticationService.setRefreshTokenCookie(
      res,
      exchange.refreshToken,
      exchange.refreshExpiresIn,
    );
    return { profile: exchange.profile };
  }
}
