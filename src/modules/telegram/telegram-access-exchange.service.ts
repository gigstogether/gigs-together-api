import { Injectable } from '@nestjs/common';
import { AuthenticationService } from '../auth/authentication.service';
import { tgUserToTelegramAccessIdentity } from './mappers/access-token-user.mapper';
import type { TGUser } from './types/user.types';
import type { V1TelegramAccessTokenExchangeResult } from './types/requests/v1-telegram-exchange-response';
import { authClientProfileFromAccessTokenIdentity } from '../auth/mappers/auth-client-profile-from-identity';
import { UserService } from '../user/user.service';
import { Messenger } from '../../shared/types/messenger.enum';
import type { TelegramAuthenticationResult } from './types/telegram-auth.types';

/**
 * Builds the access + refresh token exchange for Telegram Web App and Login Widget flows.
 */
@Injectable()
export class TelegramAccessExchangeService {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly userService: UserService,
  ) {}

  /**
   * Signs access and refresh JWTs and the public profile. The caller sets HttpOnly cookies.
   */
  async buildAccessTokenExchange(
    user: TelegramAuthenticationResult,
  ): Promise<V1TelegramAccessTokenExchangeResult> {
    const internalUser = await this.userService.findOrCreateMessengerUser({
      messenger: Messenger.Telegram,
      externalUserId: String(user.tgUser.id),
      username: user.tgUser.username,
      displayName: this.toDisplayName(user.tgUser),
    });
    const identity = tgUserToTelegramAccessIdentity(
      user.tgUser,
      internalUser.id,
    );
    const accessToken =
      await this.authenticationService.signAccessToken(identity);
    const refreshToken =
      await this.authenticationService.signRefreshToken(identity);
    const accessExpiresIn =
      this.authenticationService.getAccessExpiresInSeconds();
    const refreshExpiresIn =
      this.authenticationService.getRefreshExpiresInSeconds();
    const profile = authClientProfileFromAccessTokenIdentity(
      identity,
      user.isAdmin,
    );
    return {
      accessToken,
      accessExpiresIn,
      refreshToken,
      refreshExpiresIn,
      profile,
    };
  }

  private toDisplayName(tgUser: TGUser): string {
    return [tgUser.first_name, tgUser.last_name]
      .filter(
        (part): part is string => typeof part === 'string' && !!part.trim(),
      )
      .map((part) => part.trim())
      .join(' ');
  }
}
