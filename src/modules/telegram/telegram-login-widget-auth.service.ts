import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  TELEGRAM_INIT_DATA_EXPIRED_CODE,
  TelegramInitDataAuthExpiredError,
} from './telegram-init-data.errors';
import { TelegramService } from './telegram.service';
import type { User } from '../auth/types/user.types';
import type { TGUser } from './types/user.types';
import type { V1TelegramLoginWidgetBodyDto } from './types/requests/v1-telegram-login-widget-body';
import { AuthorizationService } from '../auth/authorization.service';

/**
 * Validates Telegram Login Widget callback data and builds a {@link User}.
 */
@Injectable()
export class TelegramLoginWidgetAuthService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async resolveUserFromLoginWidget(
    dto: V1TelegramLoginWidgetBodyDto,
  ): Promise<User> {
    try {
      this.telegramService.validateTelegramLoginWidget(dto);
      this.telegramService.validateTelegramLoginWidgetAuthDate(dto.auth_date);

      const tgUser: TGUser = {
        id: dto.id,
        first_name: dto.first_name,
        is_bot: false,
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        ...(dto.last_name !== undefined ? { last_name: dto.last_name } : {}),
        ...(dto.photo_url !== undefined ? { photo_url: dto.photo_url } : {}),
      };

      const isAdmin = await this.authorizationService.isAdmin(tgUser.id);
      return { tgUser, isAdmin };
    } catch (e) {
      if (e instanceof TelegramInitDataAuthExpiredError) {
        throw new ForbiddenException({
          message:
            'Your Telegram login data is out of date. Please open Login and try again.',
          code: TELEGRAM_INIT_DATA_EXPIRED_CODE,
        });
      }
      if (e instanceof ForbiddenException) {
        throw e;
      }
      throw new ForbiddenException('Invalid Telegram login data');
    }
  }
}
