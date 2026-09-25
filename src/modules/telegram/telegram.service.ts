import { Inject, Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type {
  InputFileData,
  TGMessage,
  TGSendPhoto,
} from './types/message.types';
import { TGParseMode } from './types/message.types';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { logError } from '../../shared/utils/logging';
import { isRecord } from '../../shared/utils/is-record';
import { PostType } from '../../shared/types/post-type.enum';
import { TelegramBotClient } from './telegram-bot.client';
import type { PlainGig } from '../gig/types/gig.types';
import type { GigPost } from '../gig/types/gig.types';
import type {
  GigCandidate,
  GigCandidatePost,
} from '../gig-candidate/types/gig-candidate.types';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { getBiggestTgPhotoFileId } from './utils/photo';
import { formatTelegramErrorMessage } from './telegram-error';
import type {
  UpdateGigModerationPostPayload,
  UpdateRejectedGigCandidatePostPayload,
  WeeklyDigestPostResult,
} from './types/telegram.service.types';
import {
  PostEditKind,
  WeeklyDigestMainChannelSendKind,
} from './types/telegram-post-composer.service.types';
import type {
  ComposeGigCandidateFeedbackMessageParams,
  ComposeGigCandidateIntakePostAfterModerationEditParams,
  TelegramPostEditComposition,
  WeeklyDigestMainChannelSendPlan,
} from './types/telegram-post-composer.service.types';

export interface TelegramPostEditResult {
  kind: PostEditKind;
  message: TGMessage;
  fileId?: string;
}

export interface TelegramPostSendResult {
  messageId: number;
  chatId: number;
  sentAtSeconds: number;
  fileId?: string;
}

interface EditGigPostParams {
  gig: PlainGig;
  post: GigPost;
  isMediaUpdateRequired: boolean;
  mediaReference?: string;
  posterFile?: InputFileData;
}

export interface EditGigPostsParams {
  gig: PlainGig;
  isMediaUpdateRequired: boolean;
  posterFile?: InputFileData;
}

export interface EditedGigPost {
  post: GigPost;
  result: TelegramPostEditResult;
}

export interface EditGigPostsResult {
  moderation?: EditedGigPost;
  main?: EditedGigPost;
}

interface UpdateGigModerationPostAfterEditParams {
  gig: PlainGig;
  moderationPost: GigPost;
  mainPost?: GigPost;
}

export interface EditGigCandidatePostParams {
  gigCandidate: GigCandidate;
  post: GigCandidatePost;
  isMediaUpdateRequired: boolean;
  posterFile?: InputFileData;
}

@Injectable()
export class TelegramService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly chatLookupCache: Cache,
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramPostComposerService: TelegramPostComposerService,
  ) {}

  private readonly logger = new Logger(TelegramService.name);

  private static readonly CHAT_ERROR_TTL_MS = 60_000 * 5;

  private static readonly WEBPAGE_CURL_FAILED_DESCRIPTION_PATTERN =
    /^Bad Request: failed to send message #([1-9]\d*) with the error message "WEBPAGE_CURL_FAILED"$/;

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

  async sendWeeklyDigestPost(
    gigs: readonly PlainGig[],
  ): Promise<WeeklyDigestPostResult | undefined> {
    const chatIdRaw = process.env.MAIN_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      this.logger.warn(
        'sendWeeklyDigestPost skipped: MAIN_CHANNEL_ID is empty',
      );
      return;
    }

    let plan: WeeklyDigestMainChannelSendPlan | undefined;
    try {
      plan = this.telegramPostComposerService.composeWeeklyDigest({
        chatId,
        gigs,
      });

      const postResult = await this.dispatchWeeklyDigestMainChannelPlan(plan);
      if (postResult === undefined) {
        throw new Error(
          'Weekly digest send finished without a Telegram message_id or post URL',
        );
      }

      return postResult;
    } catch (e: unknown) {
      const mediaFailure = this.getWeeklyDigestMediaFailureLogMeta(e, plan);
      logError(this.logger, {
        error: e,
        note: 'Weekly digest send to main channel failed',
        context: TelegramService.name,
        ...(mediaFailure ? { meta: mediaFailure } : {}),
      });
      throw new Error('Weekly digest send to main channel failed');
    }
  }

  private getWeeklyDigestMediaFailureLogMeta(
    e: unknown,
    plan: WeeklyDigestMainChannelSendPlan | undefined,
  ): Record<string, unknown> | undefined {
    const position = this.parseWebpageCurlFailedPosition(e);
    if (
      position === undefined ||
      plan?.kind !== WeeklyDigestMainChannelSendKind.SendMediaGroup
    ) {
      return;
    }

    const mediaItem = plan.mediaItems.find(
      (item) => item.position === position,
    );
    const media = plan.payload.media[position - 1];
    const meta: Record<string, unknown> = {
      telegramError: 'WEBPAGE_CURL_FAILED',
      position,
    };
    if (mediaItem === undefined || media === undefined) {
      return meta;
    }

    meta.publicId = mediaItem.publicId;
    const posterUrl = this.getSafeTelegramPosterUrlForLog(media.media);
    if (posterUrl !== undefined) {
      meta.posterUrl = posterUrl;
    }
    return meta;
  }

  private parseWebpageCurlFailedPosition(e: unknown): number | undefined {
    if (!isAxiosError(e) || e.response?.status !== 400) {
      return;
    }
    const data: unknown = e.response.data;
    if (
      !isRecord(data) ||
      data.ok !== false ||
      data.error_code !== 400 ||
      typeof data.description !== 'string'
    ) {
      return;
    }

    const match = TelegramService.WEBPAGE_CURL_FAILED_DESCRIPTION_PATTERN.exec(
      data.description,
    );
    if (!match) {
      return;
    }

    const position = Number(match[1]);
    return Number.isSafeInteger(position) ? position : undefined;
  }

  private getSafeTelegramPosterUrlForLog(
    mediaReference: string,
  ): string | undefined {
    if (!URL.canParse(mediaReference)) {
      return;
    }
    const url = new URL(mediaReference);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return;
    }
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  private async dispatchWeeklyDigestMainChannelPlan(
    plan: WeeklyDigestMainChannelSendPlan,
  ): Promise<WeeklyDigestPostResult | undefined> {
    const chatId = plan.payload.chat_id;

    let messageId: number | undefined;
    switch (plan.kind) {
      case WeeklyDigestMainChannelSendKind.SendMessage: {
        const msg = await this.telegramBotClient.sendMessage(plan.payload);
        messageId = msg.message_id;
        break;
      }
      case WeeklyDigestMainChannelSendKind.SendPhoto: {
        const msg = await this.telegramBotClient.sendPhoto(plan.payload);
        messageId = msg?.message_id;
        break;
      }
      case WeeklyDigestMainChannelSendKind.SendMediaGroup: {
        const msgs = await this.telegramBotClient.sendMediaGroup(plan.payload);
        messageId = msgs[0]?.message_id;
        break;
      }
    }

    if (messageId === undefined) {
      return;
    }

    const postUrl = this.telegramPostComposerService.getPostUrl({
      chatId,
      messageId,
    });
    if (postUrl === undefined) {
      return;
    }

    return { postUrl };
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
    return this.mapTelegramPostSendResult(message);
  }

  async sendGigCandidateIntakePost(
    gigCandidate: GigCandidate,
  ): Promise<TelegramPostSendResult | undefined> {
    const composed =
      this.telegramPostComposerService.composeGigCandidateIntakePost(
        gigCandidate,
      );
    const message = await this.telegramBotClient.sendPhoto(
      composed,
      gigCandidate.id,
    );
    return this.mapTelegramPostSendResult(message);
  }

  async sendGigCandidateModerationPost(
    gigCandidate: GigCandidate,
  ): Promise<TelegramPostSendResult | undefined> {
    const composed =
      this.telegramPostComposerService.composeGigCandidateModerationPost(
        gigCandidate,
      );
    const message = await this.telegramBotClient.sendPhoto(
      composed,
      gigCandidate.id,
    );
    return this.mapTelegramPostSendResult(message);
  }

  private mapTelegramPostSendResult(
    message: TGMessage | undefined,
  ): TelegramPostSendResult | undefined {
    if (message === undefined) {
      return;
    }

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
    const fileId = getBiggestTgPhotoFileId(message.photo);
    if (fileId !== undefined) {
      result.fileId = fileId;
    }
    return result;
  }

  sendGigCandidateFeedback(
    payload: ComposeGigCandidateFeedbackMessageParams,
  ): Promise<TGMessage> {
    const composed =
      this.telegramPostComposerService.composeGigCandidateFeedbackMessage(
        payload,
      );
    return this.telegramBotClient.sendMessage(composed);
  }

  updateRejectedGigCandidatePost(
    payload: UpdateRejectedGigCandidatePostPayload,
  ): Promise<TGMessage> {
    const composed =
      this.telegramPostComposerService.composeRejectedGigCandidatePostEdit(
        payload,
      );
    return this.telegramBotClient.editMessageCaption(composed);
  }

  updateGigCandidateIntakePostAfterModeration(
    payload: ComposeGigCandidateIntakePostAfterModerationEditParams,
  ): Promise<TGMessage> {
    const composed =
      this.telegramPostComposerService.composeGigCandidateIntakePostAfterModerationEdit(
        payload,
      );
    return this.telegramBotClient.editMessageCaption(composed);
  }

  editGigCandidatePost(
    params: EditGigCandidatePostParams,
  ): Promise<TelegramPostEditResult> {
    const composed =
      this.telegramPostComposerService.composeGigCandidatePostEdit(params);
    return this.executePostEdit(composed, params.posterFile);
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
