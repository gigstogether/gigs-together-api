import { Injectable } from '@nestjs/common';
import { TELEGRAM_WEB_BASE_URL } from './telegram.constants';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { TelegramTemplateService } from './telegram-template.service';
import { TelegramService } from './telegram.service';
import type {
  BuildCaptionPayload,
  BuildGigPermalinkPayload,
  BuildPostUrlPayload,
} from './telegram-composer.service.types';

export enum AdminMiniAppStartAction {
  EditGig = 'editGig',
  EditGigCandidate = 'editGigCandidate',
  OpenGig = 'openGig',
  OpenGigCandidate = 'openGigCandidate',
}

const DATE_LOCALE = 'en-GB';
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  weekday: 'short',
};

const ADMIN_MINI_APP_START_ACTION_SEPARATOR = '-';
const MISSING_CAPTION_FIELD_PLACEHOLDER = '-';

@Injectable()
export class TelegramComposerService {
  constructor(
    private readonly telegramTemplates: TelegramTemplateService,
    private readonly telegramService: TelegramService,
  ) {}

  buildCaption(payload: BuildCaptionPayload): string {
    const title = payload.title?.trim() || MISSING_CAPTION_FIELD_PLACEHOLDER;
    const venue = payload.venue?.trim() || MISSING_CAPTION_FIELD_PLACEHOLDER;
    const ticketsUrl =
      payload.ticketsUrl?.trim() || MISSING_CAPTION_FIELD_PLACEHOLDER;
    let dates = MISSING_CAPTION_FIELD_PLACEHOLDER;
    if (payload.date !== undefined) {
      const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
        year: DATE_FORMAT.year,
        month: DATE_FORMAT.month,
        day: DATE_FORMAT.day,
        weekday: DATE_FORMAT.weekday,
      });
      const date = dateFormatter.format(new Date(payload.date));
      const endDate = payload.endDate
        ? dateFormatter.format(new Date(payload.endDate))
        : undefined;
      dates = [date, endDate].filter(Boolean).join(' - ');
    }

    const templateKey = payload.url
      ? TELEGRAM_TEMPLATE_KEYS.mainGigWithLink
      : TELEGRAM_TEMPLATE_KEYS.mainGigWithoutLink;

    return this.telegramTemplates.render(templateKey, {
      url: payload.url,
      title,
      dates,
      venue,
      ticketsUrl,
    });
  }

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
