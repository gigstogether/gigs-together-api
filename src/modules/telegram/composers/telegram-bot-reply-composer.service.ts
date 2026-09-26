import { BadRequestException, Injectable } from '@nestjs/common';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import type { TGChatId, TGSendMessage } from '../types/message.types';
import { TGParseMode } from '../types/message.types';

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
    const suggestGigUrl = this.getSuggestGigUrl();

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
              url: suggestGigUrl,
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
}
