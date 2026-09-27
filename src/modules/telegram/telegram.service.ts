import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { logError } from '../../shared/utils/logging';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import type { TGChat } from './types/chat.types';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  private static readonly CHAT_ERROR_TTL_MS = 60_000 * 5;

  constructor(
    @Inject(CACHE_MANAGER) private readonly chatLookupCache: Cache,
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramPostComposer: TelegramPostComposerService,
  ) {}

  readonly sendMessage: TelegramBotClient['sendMessage'] =
    this.telegramBotClient.sendMessage.bind(this.telegramBotClient);

  readonly sendPhoto: TelegramBotClient['sendPhoto'] =
    this.telegramBotClient.sendPhoto.bind(this.telegramBotClient);

  readonly answerCallbackQuery: TelegramBotClient['answerCallbackQuery'] =
    this.telegramBotClient.answerCallbackQuery.bind(this.telegramBotClient);

  readonly getPostUrl: TelegramPostComposerService['getPostUrl'] =
    this.telegramPostComposer.getPostUrl.bind(this.telegramPostComposer);

  async getChatUsername(chatId: TGChat['id']): Promise<TGChat['username']> {
    const chatKey = `chat:${chatId}`;
    const errorKey = `chat-error:${chatId}`;

    const cachedChat = await this.chatLookupCache.get<TGChat>(chatKey);
    if (cachedChat) return cachedChat.username;

    const cachedError = await this.chatLookupCache.get<boolean>(errorKey);
    if (cachedError) return undefined;

    try {
      const chat = await this.telegramBotClient.getChat(chatId);
      await this.chatLookupCache.set(chatKey, chat);
      return chat.username;
    } catch (e: unknown) {
      logError(this.logger, {
        error: e,
        note: 'Error getting chat username',
        context: TelegramService.name,
        meta: { chatId },
      });
      await this.chatLookupCache.set(
        errorKey,
        true,
        TelegramService.CHAT_ERROR_TTL_MS,
      );
      return undefined;
    }
  }
}
