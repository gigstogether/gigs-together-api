import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { getRequiredConfigString } from '../../shared/utils/env';
import { logError } from '../../shared/utils/logging';
import { BucketService } from '../bucket/bucket.service';
import type { GigPoster } from '../gig/types/gig.types';
import { TelegramBotClient } from './telegram-bot.client';
import type { TGChat } from './types/chat.types';
import type { TGSetMessageReaction } from './types/message.types';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private botUsername: string | undefined;
  private adminMiniAppShortName: string | undefined;
  private suggestMiniAppShortName: string | undefined;

  private static readonly CHAT_ERROR_TTL_MS = 60_000 * 5;

  constructor(
    @Inject(CACHE_MANAGER) private readonly chatLookupCache: Cache,
    private readonly telegramBotClient: TelegramBotClient,
    private readonly bucketService: BucketService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminMiniAppShortName = getRequiredConfigString(
      this.configService,
      'TELEGRAM_ADMIN_MINI_APP_SHORT_NAME',
    );
    const suggestMiniAppShortName = getRequiredConfigString(
      this.configService,
      'TELEGRAM_SUGGEST_MINI_APP_SHORT_NAME',
    );

    const bot = await this.telegramBotClient.getMe();
    if (bot.username === undefined) {
      throw new Error('Telegram getMe did not return a bot username.');
    }

    this.botUsername = bot.username;
    this.adminMiniAppShortName = adminMiniAppShortName;
    this.suggestMiniAppShortName = suggestMiniAppShortName;
  }

  getBotUsername(): string {
    return this.getInitializedValue(this.botUsername, 'Telegram bot username');
  }

  getAdminMiniAppShortName(): string {
    return this.getInitializedValue(
      this.adminMiniAppShortName,
      'TELEGRAM_ADMIN_MINI_APP_SHORT_NAME',
    );
  }

  getSuggestMiniAppShortName(): string {
    return this.getInitializedValue(
      this.suggestMiniAppShortName,
      'TELEGRAM_SUGGEST_MINI_APP_SHORT_NAME',
    );
  }

  private getInitializedValue(value: string | undefined, name: string): string {
    if (value === undefined) {
      throw new Error(`${name} has not been initialized.`);
    }
    return value;
  }

  readonly sendMessage: TelegramBotClient['sendMessage'] =
    this.telegramBotClient.sendMessage.bind(this.telegramBotClient);

  readonly sendPhoto: TelegramBotClient['sendPhoto'] =
    this.telegramBotClient.sendPhoto.bind(this.telegramBotClient);

  readonly answerCallbackQuery: TelegramBotClient['answerCallbackQuery'] =
    this.telegramBotClient.answerCallbackQuery.bind(this.telegramBotClient);

  setMessageReaction(payload: TGSetMessageReaction): Promise<void> {
    return this.telegramBotClient.setMessageReaction(payload);
  }

  resolvePosterUrl(posterInfo?: GigPoster): string | undefined {
    if (!posterInfo) return;

    const { bucketPath, externalUrl } = posterInfo;
    if (bucketPath) {
      const bucketUrl = this.bucketService.getPublicFileUrl(bucketPath);
      if (bucketUrl) {
        // R2 poster URLs stay stable when their bytes are replaced. Telegram caches both fetched
        // media and failed fetches by URL, and editMessageMedia may return "message is not modified"
        // when the media string is unchanged. A fresh query value forces Telegram to fetch again.
        return this.addTelegramCacheBustToUrl(bucketUrl);
      }
    }
    // Arbitrary external URLs stay unchanged.
    return externalUrl;
  }

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

  private addTelegramCacheBustToUrl(url: string): string {
    const cacheBustedUrl = new URL(url);
    cacheBustedUrl.searchParams.set('tgcb', String(Date.now()));
    return cacheBustedUrl.toString();
  }
}
