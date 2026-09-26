import { Injectable } from '@nestjs/common';
import { TelegramBotReplyComposerService } from '../composers/telegram-bot-reply-composer.service';
import { TelegramBotClient } from '../telegram-bot.client';
import type { TGChat } from '../types/chat.types';
import type { TGMessage } from '../types/message.types';

@Injectable()
export class TelegramBotReplyService {
  constructor(
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramBotReplyComposer: TelegramBotReplyComposerService,
  ) {}

  sendIncomingMessageUnavailable(chat: TGChat): Promise<TGMessage> {
    const message =
      this.telegramBotReplyComposer.composeIncomingMessageUnavailable(chat);
    return this.telegramBotClient.sendMessage(message);
  }

  sendStartCommandResponse(chat: TGChat): Promise<TGMessage> {
    const message =
      this.telegramBotReplyComposer.composeStartCommandResponse(chat);
    return this.telegramBotClient.sendMessage(message);
  }

  sendUnknownCommandResponse(chat: TGChat): Promise<TGMessage> {
    const message =
      this.telegramBotReplyComposer.composeUnknownCommandResponse(chat);
    return this.telegramBotClient.sendMessage(message);
  }
}
