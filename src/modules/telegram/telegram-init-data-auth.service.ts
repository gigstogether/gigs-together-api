import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  TELEGRAM_INIT_DATA_EXPIRED_CODE,
  TelegramInitDataAuthExpiredError,
} from './telegram-init-data.errors';
import { TelegramInitDataValidationService } from './telegram-init-data-validation.service';
import type { TGUser } from './types/user.types';
import type { TelegramAuthenticationResult } from './types/telegram-auth.types';

/**
 * Validates Telegram WebApp `initData` (query-string form) and builds a `User`.
 */
@Injectable()
export class TelegramInitDataAuthService {
  constructor(
    private readonly telegramInitDataValidationService: TelegramInitDataValidationService,
  ) {}

  async resolveUserFromInitDataString(
    telegramInitDataString: string,
  ): Promise<TelegramAuthenticationResult> {
    try {
      const { parsedData, dataCheckString } =
        this.telegramInitDataValidationService.parseTelegramInitDataString(
          telegramInitDataString,
        );
      this.telegramInitDataValidationService.validateTelegramInitData(
        dataCheckString,
        parsedData.hash,
      );
      this.telegramInitDataValidationService.validateTelegramInitDataAuthDate(
        parsedData.auth_date,
      );

      const tgUser: TGUser = JSON.parse(parsedData.user);

      // TODO: explicitly check if it's a user instead of if it's a bot
      if (tgUser?.is_bot) {
        throw new ForbiddenException('Bots are not allowed');
      }

      return { tgUser };
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
