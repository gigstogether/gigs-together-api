import { BadRequestException, Injectable } from '@nestjs/common';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import type { TGChat } from '../types/chat.types';
import type {
  TGInlineKeyboardButton,
  TGSendMessage,
} from '../types/message.types';
import { TGParseMode } from '../types/message.types';

const SUGGEST_GIG_PATH = '/suggest/launch';

type UserResponseTemplateKey =
  | typeof TELEGRAM_TEMPLATE_KEYS.incomingMessageUnavailable
  | typeof TELEGRAM_TEMPLATE_KEYS.commandStart
  | typeof TELEGRAM_TEMPLATE_KEYS.commandUnknown;

@Injectable()
export class TelegramBotReplyComposerService {
  constructor(private readonly telegramTemplates: TelegramTemplateService) {}

  composeIncomingMessageUnavailable(chat: TGChat): TGSendMessage {
    return this.composeUserResponse(
      chat,
      TELEGRAM_TEMPLATE_KEYS.incomingMessageUnavailable,
    );
  }

  composeStartCommandResponse(chat: TGChat): TGSendMessage {
    return this.composeUserResponse(chat, TELEGRAM_TEMPLATE_KEYS.commandStart);
  }

  composeUnknownCommandResponse(chat: TGChat): TGSendMessage {
    return this.composeUserResponse(
      chat,
      TELEGRAM_TEMPLATE_KEYS.commandUnknown,
    );
  }

  private composeUserResponse(
    chat: TGChat,
    templateKey: UserResponseTemplateKey,
  ): TGSendMessage {
    const contactAdminsUrl = this.telegramTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.linkContactAdmins,
    );

    return {
      chat_id: chat.id,
      text: this.telegramTemplates.render(templateKey, {
        contactAdminsUrl: this.escapeTelegramHtmlAttribute(contactAdminsUrl),
      }),
      parse_mode: TGParseMode.HTML,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[this.composeSuggestGigButton(chat)]],
      },
    };
  }

  private composeSuggestGigButton(chat: TGChat): TGInlineKeyboardButton {
    const text = this.telegramTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.buttonSuggestGig,
    );

    return chat.type === 'private'
      ? {
          text,
          web_app: { url: this.getSuggestGigWebAppUrl() },
        }
      : {
          text,
          url: this.getSuggestGigUrl(),
        };
  }

  private escapeTelegramHtmlAttribute(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  private getSuggestGigUrl(): string {
    const suggestGigUrl = (process.env.SUGGEST_GIG_URL ?? '').trim();
    if (suggestGigUrl === '') {
      throw new BadRequestException(
        'Cannot compose user response: SUGGEST_GIG_URL is not configured.',
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(suggestGigUrl);
    } catch (e) {
      throw new BadRequestException(
        'Cannot compose user response: SUGGEST_GIG_URL must be a valid URL.',
        { cause: e },
      );
    }

    return parsedUrl.toString();
  }

  private getSuggestGigWebAppUrl(): string {
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    if (appBaseUrl === '') {
      throw new BadRequestException(
        'Cannot compose private user response: APP_BASE_URL is not configured.',
      );
    }

    try {
      return new URL(SUGGEST_GIG_PATH, appBaseUrl).toString();
    } catch (e) {
      throw new BadRequestException(
        'Cannot compose private user response: APP_BASE_URL must be a valid URL.',
        { cause: e },
      );
    }
  }
}
