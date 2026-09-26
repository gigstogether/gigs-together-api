import { BadRequestException, Injectable } from '@nestjs/common';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import type { TGChatId, TGSendMessage } from '../types/message.types';
import { TGParseMode } from '../types/message.types';

const SUGGEST_GIG_PATH = '/suggest/launch';

type UserResponseTemplateKey =
  | typeof TELEGRAM_TEMPLATE_KEYS.incomingMessageUnavailable
  | typeof TELEGRAM_TEMPLATE_KEYS.commandStart
  | typeof TELEGRAM_TEMPLATE_KEYS.commandUnknown;

@Injectable()
export class TelegramBotReplyComposerService {
  constructor(private readonly telegramTemplates: TelegramTemplateService) {}

  composeIncomingMessageUnavailable(chatId: TGChatId): TGSendMessage {
    return this.composeUserResponse(
      chatId,
      TELEGRAM_TEMPLATE_KEYS.incomingMessageUnavailable,
    );
  }

  composeStartCommandResponse(chatId: TGChatId): TGSendMessage {
    return this.composeUserResponse(
      chatId,
      TELEGRAM_TEMPLATE_KEYS.commandStart,
    );
  }

  composeUnknownCommandResponse(chatId: TGChatId): TGSendMessage {
    return this.composeUserResponse(
      chatId,
      TELEGRAM_TEMPLATE_KEYS.commandUnknown,
    );
  }

  private composeUserResponse(
    chatId: TGChatId,
    templateKey: UserResponseTemplateKey,
  ): TGSendMessage {
    const contactAdminsUrl = this.telegramTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.linkContactAdmins,
    );

    return {
      chat_id: chatId,
      text: this.telegramTemplates.render(templateKey, {
        contactAdminsUrl: this.escapeTelegramHtmlAttribute(contactAdminsUrl),
      }),
      parse_mode: TGParseMode.HTML,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: this.telegramTemplates.getText(
                TELEGRAM_TEMPLATE_KEYS.buttonSuggestGig,
              ),
              url: this.buildSuggestGigUrl(),
            },
          ],
        ],
      },
    };
  }

  private escapeTelegramHtmlAttribute(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  private buildSuggestGigUrl(): string {
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    if (appBaseUrl === '') {
      throw new BadRequestException(
        'Cannot compose user response: APP_BASE_URL is not configured.',
      );
    }

    return new URL(SUGGEST_GIG_PATH, appBaseUrl).toString();
  }
}
