import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  InputFileData,
  TGMessage,
  TGSendPhoto,
} from './types/message.types';
import { TGParseMode } from './types/message.types';
import type { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { logError } from '../../shared/utils/logging';
import { PostType } from '../../shared/types/post-type.enum';
import { TelegramBotClient } from './telegram-bot.client';
import type { PlainGig } from '../gig/types/gig.types';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { getBiggestTgPhotoFileId } from './utils/photo';
import { formatTelegramErrorMessage } from './telegram-error';
import type {
  TelegramPostEditResult,
  TelegramPostSendResult,
  TelegramPhotoPostSendResult,
  EditGigPostParams,
  EditGigPostsParams,
  EditGigPostsResult,
  UpdateGigModerationPostAfterEditParams,
  UpdateGigModerationPostPayload,
} from './telegram.service.types';
import { PostEditKind } from './telegram-post-composer.service.types';
import type { TelegramPostEditComposition } from './telegram-post-composer.service.types';

@Injectable()
export class TelegramService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly chatLookupCache: Cache,
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramPostComposerService: TelegramPostComposerService,
  ) {}

  private readonly logger = new Logger(TelegramService.name);

  private static readonly CHAT_ERROR_TTL_MS = 60_000 * 5;

  readonly sendMessage: TelegramBotClient['sendMessage'] =
    this.telegramBotClient.sendMessage.bind(this.telegramBotClient);

  readonly sendPhoto: TelegramBotClient['sendPhoto'] =
    this.telegramBotClient.sendPhoto.bind(this.telegramBotClient);

  readonly answerCallbackQuery: TelegramBotClient['answerCallbackQuery'] =
    this.telegramBotClient.answerCallbackQuery.bind(this.telegramBotClient);

  readonly pickTgPost: TelegramPostComposerService['pickTgPost'] =
    this.telegramPostComposerService.pickTgPost.bind(
      this.telegramPostComposerService,
    );

  readonly getPostUrl: TelegramPostComposerService['getPostUrl'] =
    this.telegramPostComposerService.getPostUrl.bind(
      this.telegramPostComposerService,
    );

  /**
   * Edits an existing Main or Moderation Gig post in Telegram.
   * The caller supplies the stored post reference so the exact message is targeted.
   * Updates media when requested; otherwise updates the caption or text.
   */
  editGigPost(params: EditGigPostParams): Promise<TelegramPostEditResult> {
    const composed =
      this.telegramPostComposerService.composeGigPostEdit(params);
    return this.executePostEdit(composed, params.posterFile);
  }

  async editGigPostsBestEffort(
    params: EditGigPostsParams,
  ): Promise<EditGigPostsResult> {
    const moderationPost = this.telegramPostComposerService.pickTgPost(
      params.gig.posts,
      PostType.Moderation,
    );
    const mainPost = this.telegramPostComposerService.pickTgPost(
      params.gig.posts,
      PostType.Main,
    );
    const editResult: EditGigPostsResult = {};

    let moderationEditResult: TelegramPostEditResult | undefined;
    if (params.isMediaUpdateRequired && moderationPost !== undefined) {
      const moderationEditParams: EditGigPostParams = {
        gig: params.gig,
        post: moderationPost,
        isMediaUpdateRequired: true,
      };
      if (params.posterFile !== undefined) {
        moderationEditParams.posterFile = params.posterFile;
      }
      moderationEditResult =
        await this.editGigPostBestEffort(moderationEditParams);
      if (moderationEditResult !== undefined) {
        editResult.moderation = {
          post: moderationPost,
          result: moderationEditResult,
        };
      }
    }

    if (mainPost !== undefined) {
      const mainEditParams: EditGigPostParams = {
        gig: params.gig,
        post: mainPost,
        isMediaUpdateRequired: params.isMediaUpdateRequired,
      };
      if (moderationEditResult?.fileId !== undefined) {
        // Upload replacement media once through Moderation, then reuse its fileId for Main.
        mainEditParams.mediaReference = moderationEditResult.fileId;
      } else if (params.posterFile !== undefined) {
        mainEditParams.posterFile = params.posterFile;
      }
      const mainEditResult = await this.editGigPostBestEffort(mainEditParams);
      if (mainEditResult !== undefined) {
        editResult.main = {
          post: mainPost,
          result: mainEditResult,
        };
      }
    }

    if (moderationPost !== undefined && editResult.moderation === undefined) {
      const moderationUpdateParams: UpdateGigModerationPostAfterEditParams = {
        gig: params.gig,
        moderationPost,
      };
      if (mainPost !== undefined) {
        moderationUpdateParams.mainPost = mainPost;
      }
      await this.updateGigModerationPostAfterEditBestEffort(
        moderationUpdateParams,
      );
    }

    return editResult;
  }

  private async editGigPostBestEffort(
    params: EditGigPostParams,
  ): Promise<TelegramPostEditResult | undefined> {
    try {
      return await this.editGigPost(params);
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram post update failed for publicId=${params.gig.publicId} postType=${params.post.type}: ${formatTelegramErrorMessage(e)}`,
      );
      return undefined;
    }
  }

  async sendMainPost(
    gig: PlainGig,
  ): Promise<TelegramPostSendResult | undefined> {
    const composedMainPost: TGSendPhoto =
      this.telegramPostComposerService.composeMainPost(gig);
    const message = await this.telegramBotClient.sendPhoto(
      composedMainPost,
      gig.id,
    );
    return this.mapTelegramPhotoPostSendResult(message);
  }

  private mapTelegramPostSendResult(
    message: TGMessage,
  ): TelegramPostSendResult {
    const chatId = message.sender_chat?.id ?? message.chat?.id;
    if (
      !Number.isInteger(message.message_id) ||
      !Number.isInteger(chatId) ||
      !Number.isInteger(message.date)
    ) {
      throw new Error('Telegram sent post reference is incomplete');
    }

    const result: TelegramPostSendResult = {
      messageId: message.message_id,
      chatId,
      sentAtSeconds: message.date,
    };
    return result;
  }

  private mapTelegramPhotoPostSendResult(
    message: TGMessage | undefined,
  ): TelegramPhotoPostSendResult | undefined {
    if (message === undefined) {
      return;
    }
    const result = this.mapTelegramPostSendResult(message);

    const fileId = getBiggestTgPhotoFileId(message.photo);
    if (fileId === undefined) {
      throw new Error('Telegram photo response has no fileId');
    }
    return { ...result, fileId };
  }

  private async executePostEdit(
    composed: TelegramPostEditComposition,
    posterFile?: InputFileData,
  ): Promise<TelegramPostEditResult> {
    switch (composed.kind) {
      case PostEditKind.Media: {
        let message: TGMessage;
        if (posterFile !== undefined) {
          message = await this.telegramBotClient.editMessageMedia(
            composed.payload,
            posterFile,
          );
        } else {
          message = await this.telegramBotClient.editMessageMedia(
            composed.payload,
          );
        }
        const result: TelegramPostEditResult = {
          kind: PostEditKind.Media,
          message,
        };
        const fileId = getBiggestTgPhotoFileId(message.photo);
        if (fileId !== undefined) {
          result.fileId = fileId;
        }
        return result;
      }
      case PostEditKind.Caption: {
        const message = await this.telegramBotClient.editMessageCaption(
          composed.payload,
        );
        return { kind: PostEditKind.Caption, message };
      }
      case PostEditKind.Text: {
        const message = await this.telegramBotClient.editMessageText(
          composed.payload,
        );
        return { kind: PostEditKind.Text, message };
      }
    }
  }

  async updateGigModerationPost(
    payload: UpdateGigModerationPostPayload,
  ): Promise<void> {
    const {
      moderationPost,
      mainPost,
      title,
      publicId,
      gigId,
      expectedVersion,
      isVisible,
    } = payload;

    const editGigUrl =
      this.telegramPostComposerService.buildEditGigUrl(publicId);
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const gigUrl = this.telegramPostComposerService.buildGigPermalink({
      baseUrl: appBaseUrl,
      publicId,
    });
    const adminGigUrl =
      this.telegramPostComposerService.buildAdminGigUrl(publicId);

    const mainPostUrl = mainPost
      ? this.telegramPostComposerService.getPostUrl({
          messageId: mainPost.messageId,
          chatId: mainPost.chatId,
        })
      : undefined;

    const replyMarkup =
      this.telegramPostComposerService.buildGigModerationReplyMarkup({
        gigId,
        expectedVersion,
        isVisible,
        mainPostUrl,
        editGigUrl,
      });

    const caption = this.telegramPostComposerService.buildGigModerationCaption({
      title,
      gigUrl,
      mainPostUrl,
      adminGigUrl,
    });

    // NOTE: Telegram can't remove media from a photo message via edit APIs,
    // so the poster will remain, but the caption/text will be edited.
    await this.telegramBotClient.editMessageCaption({
      chatId: moderationPost.chatId,
      messageId: moderationPost.messageId,
      caption,
      parseMode: TGParseMode.HTML,
      disableWebPagePreview: true,
      replyMarkup,
    });
  }

  private async updateGigModerationPostAfterEditBestEffort(
    params: UpdateGigModerationPostAfterEditParams,
  ): Promise<void> {
    const payload: UpdateGigModerationPostPayload = {
      gigId: params.gig.id,
      expectedVersion: params.gig.version,
      isVisible: params.gig.isVisible,
      title: params.gig.title,
      publicId: params.gig.publicId,
      moderationPost: {
        chatId: params.moderationPost.chatId,
        messageId: params.moderationPost.id,
      },
    };
    if (params.mainPost !== undefined) {
      payload.mainPost = {
        chatId: params.mainPost.chatId,
        messageId: params.mainPost.id,
      };
    }

    try {
      await this.updateGigModerationPost(payload);
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram moderation post update failed for publicId=${params.gig.publicId}: ${formatTelegramErrorMessage(e)}`,
      );
    }
  }

  public async getChatUsername(
    chatId: TGChat['id'],
  ): Promise<TGChat['username']> {
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
