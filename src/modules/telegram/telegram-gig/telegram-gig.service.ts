import { Injectable, Logger } from '@nestjs/common';
import { PostType } from '../../../shared/types/post-type.enum';
import type { PlainGig } from '../../gig/types/gig.types';
import { TelegramGigComposerService } from './telegram-gig-composer.service';
import { TelegramBotClient } from '../telegram-bot.client';
import { formatTelegramErrorMessage } from '../telegram-error';
import { TelegramComposerService } from '../telegram-composer.service';
import type { TelegramPostEditComposition } from '../telegram-composer.service.types';
import { PostEditKind } from '../telegram-composer.service.types';
import type {
  InputFileData,
  TGMessage,
  TGSendPhoto,
} from '../types/message.types';
import { TGParseMode } from '../types/message.types';
import { getBiggestTgPhotoFileId } from '../utils/photo';
import type {
  EditGigPostParams,
  EditGigPostsParams,
  EditGigPostsResult,
  TelegramGigPhotoPostSendResult,
  TelegramGigPostEditResult,
  TelegramGigPostSendResult,
  UpdateGigModerationPostAfterEditParams,
  UpdateGigModerationPostPayload,
} from './telegram-gig.service.types';

@Injectable()
export class TelegramGigService {
  private readonly logger = new Logger(TelegramGigService.name);

  constructor(
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramGigComposer: TelegramGigComposerService,
    private readonly telegramComposer: TelegramComposerService,
  ) {}

  readonly pickPost: TelegramGigComposerService['pickPost'] =
    this.telegramGigComposer.pickPost.bind(this.telegramGigComposer);

  /**
   * Edits an existing Main or Moderation Gig post in Telegram.
   * The caller supplies the stored post reference so the exact message is targeted.
   * Updates media when requested; otherwise updates the caption or text.
   */
  editPost(params: EditGigPostParams): Promise<TelegramGigPostEditResult> {
    const composed = this.telegramGigComposer.composePostEdit(params);
    return this.executePostEdit(composed, params.posterFile);
  }

  async editPostsBestEffort(
    params: EditGigPostsParams,
  ): Promise<EditGigPostsResult> {
    const moderationPost = this.telegramGigComposer.pickPost(
      params.gig.posts,
      PostType.Moderation,
    );
    const mainPost = this.telegramGigComposer.pickPost(
      params.gig.posts,
      PostType.Main,
    );
    const editResult: EditGigPostsResult = {};

    let moderationEditResult: TelegramGigPostEditResult | undefined;
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
        await this.editPostBestEffort(moderationEditParams);
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
      const mainEditResult = await this.editPostBestEffort(mainEditParams);
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
      await this.updateModerationPostAfterEditBestEffort(
        moderationUpdateParams,
      );
    }

    return editResult;
  }

  async sendMainPost(
    gig: PlainGig,
  ): Promise<TelegramGigPostSendResult | undefined> {
    const composedMainPost: TGSendPhoto =
      this.telegramGigComposer.composeMainPost(gig);
    const message = await this.telegramBotClient.sendPhoto(
      composedMainPost,
      gig.id,
    );
    return this.mapPhotoPostSendResult(message);
  }

  async updateModerationPost(
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

    const editGigUrl = this.telegramGigComposer.buildEditUrl(publicId);
    const gigUrl = this.telegramComposer.buildGigPermalink({
      baseUrl: (process.env.APP_BASE_URL ?? '').trim(),
      publicId,
    });
    const adminGigUrl = this.telegramGigComposer.buildAdminUrl(publicId);
    const mainPostUrl = mainPost
      ? this.telegramComposer.getPostUrl({
          messageId: mainPost.messageId,
          chatId: mainPost.chatId,
        })
      : undefined;

    const replyMarkup = this.telegramGigComposer.buildModerationReplyMarkup({
      gigId,
      expectedVersion,
      isVisible,
      mainPostUrl,
      editGigUrl,
    });
    const caption = this.telegramGigComposer.buildModerationCaption({
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

  private async editPostBestEffort(
    params: EditGigPostParams,
  ): Promise<TelegramGigPostEditResult | undefined> {
    try {
      return await this.editPost(params);
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram post update failed for publicId=${params.gig.publicId} postType=${params.post.type}: ${formatTelegramErrorMessage(e)}`,
      );
      return undefined;
    }
  }

  private mapPostSendResult(message: TGMessage): TelegramGigPostSendResult {
    const chatId = message.sender_chat?.id ?? message.chat?.id;
    if (
      !Number.isInteger(message.message_id) ||
      !Number.isInteger(chatId) ||
      !Number.isInteger(message.date)
    ) {
      throw new Error('Telegram sent post reference is incomplete');
    }

    return {
      messageId: message.message_id,
      chatId,
      sentAtSeconds: message.date,
    };
  }

  private mapPhotoPostSendResult(
    message: TGMessage | undefined,
  ): TelegramGigPhotoPostSendResult | undefined {
    if (message === undefined) {
      return;
    }
    const result = this.mapPostSendResult(message);
    const fileId = getBiggestTgPhotoFileId(message.photo);
    if (fileId === undefined) {
      throw new Error('Telegram photo response has no fileId');
    }
    return { ...result, fileId };
  }

  private async executePostEdit(
    composed: TelegramPostEditComposition,
    posterFile?: InputFileData,
  ): Promise<TelegramGigPostEditResult> {
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
        const result: TelegramGigPostEditResult = {
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

  private async updateModerationPostAfterEditBestEffort(
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
      await this.updateModerationPost(payload);
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram moderation post update failed for publicId=${params.gig.publicId}: ${formatTelegramErrorMessage(e)}`,
      );
    }
  }
}
