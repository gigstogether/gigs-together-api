import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  TELEGRAM_INIT_DATA_EXPIRED_CODE,
  TelegramInitDataAuthExpiredError,
} from './telegram-init-data.errors';
import { TelegramService } from './telegram.service';
import type { User } from '../auth/types/user.types';
import type { TGUser } from './types/user.types';
import { AuthorizationService } from '../auth/authorization.service';

/**
 * Validates Telegram WebApp `initData` (query-string form) and builds a `User`.
 */
@Injectable()
export class TelegramInitDataAuthService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async resolveUserFromInitDataString(
    telegramInitDataString: string,
  ): Promise<User> {
    try {
      const { parsedData, dataCheckString } =
        this.telegramService.parseTelegramInitDataString(
          telegramInitDataString,
        );
      this.telegramService.validateTelegramInitData(
        dataCheckString,
        parsedData.hash,
      );
      this.telegramService.validateTelegramInitDataAuthDate(
        parsedData.auth_date,
      );

      const tgUser: TGUser = JSON.parse(parsedData.user);

      // TODO: explicitly check if it's a user instead of if it's a bot
      if (tgUser?.is_bot) {
        throw new ForbiddenException('Bots are not allowed');
      }

      const isAdmin = await this.authorizationService.isAdmin(tgUser.id);
      return { tgUser, isAdmin };
    } catch (e) {
      if (e instanceof TelegramInitDataAuthExpiredError) {
        throw new ForbiddenException({
          message:
            'Your Telegram authentication data is out of date. Please reload this page so Telegram can send fresh data — for example pull to refresh in the mini app, or close and reopen the app from the bot chat.',
          code: TELEGRAM_INIT_DATA_EXPIRED_CODE,
        });
      }
      if (e instanceof ForbiddenException) {
        throw e;
      }
      throw new ForbiddenException('Invalid Telegram user data');
    }
  }
}
