import { Injectable } from '@nestjs/common';
import { TELEGRAM_WEB_BASE_URL } from './telegram.constants';
import { TelegramService } from './telegram.service';
import type {
  BuildGigPermalinkPayload,
  BuildPostUrlPayload,
} from './telegram-composer.service.types';

export enum AdminMiniAppStartAction {
  EditGig = 'editGig',
  EditGigCandidate = 'editGigCandidate',
  OpenGig = 'openGig',
  OpenGigCandidate = 'openGigCandidate',
}

const ADMIN_MINI_APP_START_ACTION_SEPARATOR = '-';

@Injectable()
export class TelegramComposerService {
  constructor(private readonly telegramService: TelegramService) {}

  buildGigPermalink(input: BuildGigPermalinkPayload): string | undefined {
    if (!input.baseUrl || !input.publicId) {
      return undefined;
    }

    return new URL(
      `/gigs/${encodeURIComponent(input.publicId)}`,
      input.baseUrl,
    ).toString();
  }

  buildAdminMiniAppUrl(
    action: AdminMiniAppStartAction,
    resourceId: string,
  ): string {
    const shortName = this.telegramService.getAdminMiniAppShortName();
    const miniAppBaseUrl = `${TELEGRAM_WEB_BASE_URL}/${this.telegramService.getBotUsername()}/${encodeURIComponent(shortName)}`;
    return `${miniAppBaseUrl}?startapp=${encodeURIComponent(`${action}${ADMIN_MINI_APP_START_ACTION_SEPARATOR}${resourceId}`)}`;
  }

  buildPostUrl(payload: BuildPostUrlPayload): string | undefined {
    const { chatUsername, messageId, chatId } = payload;

    if (!messageId) return;
    if (chatUsername) {
      return `${TELEGRAM_WEB_BASE_URL}/${chatUsername}/${messageId}`;
    }
    if (chatId) {
      const rawChatId = String(chatId);
      const internalChatId = rawChatId.startsWith('-100')
        ? rawChatId.slice(4)
        : rawChatId;
      return `${TELEGRAM_WEB_BASE_URL}/c/${internalChatId}/${messageId}`;
    }
  }
}
