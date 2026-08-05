import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TGMessage, TGSendPhoto, TGChatId } from './types/message.types';
import { TGParseMode } from './types/message.types';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { logError } from '../../shared/utils/logging';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramAuthService } from './telegram-auth.service';
import type { PlainGig } from '../gig/types/gig.types';
import type { GigCandidateRecord } from '../gig-candidate/types/gig-candidate.types';
import { Status } from '../gig/types/status.enum';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import {
  EditSubmissionFeedbackPayload,
  HandlePostRejectPayload,
  UpdateModerationPostAfterGigPublishedPayload,
  UpdatePublishedSubmissionFeedbackPayload,
  UpdateGigCandidatePostParams,
  WeeklyDigestMainChannelPublishResult,
} from './types/telegram.service.types';
import {
  PostEditKind,
  WeeklyDigestMainChannelSendKind,
  WeeklyDigestMainChannelSendPlan,
} from './types/telegram-post-composer.service.types';

@Injectable()
export class TelegramService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly chatLookupCache: Cache,
    private readonly telegramAuthService: TelegramAuthService,
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

  readonly parseTelegramInitDataString: TelegramAuthService['parseTelegramInitDataString'] =
    this.telegramAuthService.parseTelegramInitDataString.bind(
      this.telegramAuthService,
    );

  readonly validateTelegramInitData: TelegramAuthService['validateTelegramInitData'] =
    this.telegramAuthService.validateTelegramInitData.bind(
      this.telegramAuthService,
    );

  readonly validateTelegramInitDataAuthDate: TelegramAuthService['validateTelegramInitDataAuthDate'] =
    this.telegramAuthService.validateTelegramInitDataAuthDate.bind(
      this.telegramAuthService,
    );

  readonly validateTelegramLoginWidget: TelegramAuthService['validateTelegramLoginWidget'] =
    this.telegramAuthService.validateTelegramLoginWidget.bind(
      this.telegramAuthService,
    );

  readonly validateTelegramLoginWidgetAuthDate: TelegramAuthService['validateTelegramLoginWidgetAuthDate'] =
    this.telegramAuthService.validateTelegramLoginWidgetAuthDate.bind(
      this.telegramAuthService,
    );

  readonly getPostUrl: TelegramPostComposerService['getPostUrl'] =
    this.telegramPostComposerService.getPostUrl.bind(
      this.telegramPostComposerService,
    );

  async editModerationPost(
    gig: PlainGig,
    opts?: { updateMedia?: boolean },
  ): Promise<TGMessage | undefined> {
    const composed = this.telegramPostComposerService.composeModerationPostEdit(
      gig,
      opts,
    );
    if (!composed) return;

    switch (composed.kind) {
      case PostEditKind.Media:
        return this.telegramBotClient.editMessageMedia(composed.payload);
      case PostEditKind.Caption:
        return this.telegramBotClient.editMessageCaption(composed.payload);
      case PostEditKind.Text:
        return this.telegramBotClient.editMessageText(composed.payload);
    }
  }

  /**
   * Updates an already published post in the main channel (caption/text).
   * Does nothing if the gig has no stored post reference.
   *
   * NOTE: Can optionally update the media (poster) via editMessageMedia.
   */
  async editMainPost(
    gig: PlainGig,
    opts?: { updateMedia?: boolean },
  ): Promise<TGMessage | undefined> {
    const composed = this.telegramPostComposerService.composeMainPostEdit(
      gig,
      opts,
    );
    if (!composed) return;

    switch (composed.kind) {
      case PostEditKind.Media:
        return this.telegramBotClient.editMessageMedia(composed.payload);
      case PostEditKind.Caption:
        return this.telegramBotClient.editMessageCaption(composed.payload);
      case PostEditKind.Text:
        return this.telegramBotClient.editMessageText(composed.payload);
    }
  }

  async publishWeeklyDigestToMainChannel(
    gigs: readonly PlainGig[],
  ): Promise<WeeklyDigestMainChannelPublishResult | undefined> {
    const chatIdRaw = process.env.MAIN_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      this.logger.warn(
        'publishWeeklyDigestToMainChannel skipped: MAIN_CHANNEL_ID is empty',
      );
      return;
    }

    try {
      const plan: WeeklyDigestMainChannelSendPlan =
        this.telegramPostComposerService.composeWeeklyDigest({
          chatId,
          gigs,
        });

      const published = await this.dispatchWeeklyDigestMainChannelPlan(plan);
      if (published === undefined) {
        throw new Error(
          'Weekly digest publish finished without a Telegram message_id or post URL',
        );
      }

      return published;
    } catch (e: unknown) {
      logError(this.logger, {
        error: e,
        note: 'Weekly digest publish to main channel failed',
        context: TelegramService.name,
      });
      throw e;
    }
  }

  private async dispatchWeeklyDigestMainChannelPlan(
    plan: WeeklyDigestMainChannelSendPlan,
  ): Promise<WeeklyDigestMainChannelPublishResult | undefined> {
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

  publishMain(gig: PlainGig): Promise<TGMessage | undefined> {
    const composedMainPost: TGSendPhoto =
      this.telegramPostComposerService.composeMainPost(gig);
    return this.telegramBotClient.sendPhoto(composedMainPost, String(gig._id));
  }

  async sendToModeration(gig: PlainGig): Promise<TGMessage | undefined> {
    const composedModerationPost: TGSendPhoto =
      this.telegramPostComposerService.composeModerationPost(gig);
    return this.telegramBotClient.sendPhoto(
      composedModerationPost,
      String(gig._id),
    );
  }

  sendGigCandidateToSuggestion(
    gigCandidate: GigCandidateRecord,
  ): Promise<TGMessage | undefined> {
    const composed =
      this.telegramPostComposerService.composeGigCandidatePost(gigCandidate);
    return this.telegramBotClient.sendPhoto(composed, gigCandidate.id);
  }

  async updateGigCandidatePost(
    params: UpdateGigCandidatePostParams,
  ): Promise<void> {
    const composed =
      this.telegramPostComposerService.composeGigCandidatePostEdit(params);
    switch (composed.kind) {
      case PostEditKind.Caption:
        await this.telegramBotClient.editMessageCaption(composed.payload);
        return;
      case PostEditKind.Text:
        await this.telegramBotClient.editMessageText(composed.payload);
        return;
      case PostEditKind.Media:
        await this.telegramBotClient.editMessageMedia(composed.payload);
        return;
    }
  }

  async updateModerationPostAfterGigPublished(
    payload: UpdateModerationPostAfterGigPublishedPayload,
  ): Promise<void> {
    const { moderationPost, publishPost, title, publicId, gigId } = payload;

    const editGigUrl =
      this.telegramPostComposerService.buildEditGigUrl(publicId);
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const gigUrl = this.telegramPostComposerService.buildGigPermalink({
      baseUrl: appBaseUrl,
      publicId,
    });
    const adminGigUrl = this.telegramPostComposerService.buildAdminGigUrl({
      baseUrl: appBaseUrl,
      publicId,
    });

    const publishPostChatIdUrl = publishPost
      ? this.telegramPostComposerService.getPostUrl({
          messageId: publishPost.messageId,
          chatId: publishPost.chatId,
        })
      : undefined;

    const replyMarkup =
      this.telegramPostComposerService.buildAfterPublishModerationReplyMarkup({
        gigId,
        publishPostUrl: publishPostChatIdUrl,
        editGigUrl,
      });

    const caption =
      this.telegramPostComposerService.buildPublishedModerationCaption({
        title,
        gigUrl,
        publishPostUrl: publishPostChatIdUrl,
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

  async updatePublishedSubmissionFeedback(
    payload: UpdatePublishedSubmissionFeedbackPayload,
  ): Promise<void> {
    const { gig } = payload;
    const { suggestedBy, publicId } = gig;

    if (suggestedBy.feedbackMessageId == null) {
      return;
    }

    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const gigUrl = this.telegramPostComposerService.buildGigPermalink({
      baseUrl: appBaseUrl,
      publicId,
    });

    await this.editSubmissionFeedback({
      gig,
      chatId: suggestedBy.userId,
      messageId: suggestedBy.feedbackMessageId,
      status: Status.Published,
      url: gigUrl,
    });
  }

  async handlePostReject({ gig, moderationMessage }: HandlePostRejectPayload) {
    const editGigUrl = this.telegramPostComposerService.buildEditGigUrl(
      gig.publicId,
    );
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const adminGigUrl = this.telegramPostComposerService.buildAdminGigUrl({
      baseUrl: appBaseUrl,
      publicId: gig.publicId,
    });
    const replyMarkup =
      this.telegramPostComposerService.buildRejectedModerationReplyMarkup(
        editGigUrl,
      );
    const body = this.telegramPostComposerService.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });
    const caption =
      this.telegramPostComposerService.buildRejectedModerationCaption({
        body,
        adminGigUrl,
      });

    await this.telegramBotClient.editMessageCaption({
      chatId: moderationMessage.chatId,
      messageId: moderationMessage.messageId,
      caption,
      parseMode: TGParseMode.HTML,
      disableWebPagePreview: true,
      replyMarkup,
    });

    if (gig.suggestedBy.feedbackMessageId != null) {
      await this.editSubmissionFeedback({
        gig,
        chatId: gig.suggestedBy.userId,
        messageId: gig.suggestedBy.feedbackMessageId,
        status: Status.Rejected,
      });
    }
  }

  private editSubmissionFeedback(
    payload: EditSubmissionFeedbackPayload,
  ): Promise<TGMessage | undefined> {
    const { gig, chatId, messageId, status, url } = payload;

    if (!chatId || messageId == null) {
      return Promise.resolve(undefined);
    }

    const body = this.telegramPostComposerService.buildCaption({
      url: status === Status.Published ? url : undefined,
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });
    const caption =
      this.telegramPostComposerService.buildSubmissionFeedbackCaption({
        body,
        status,
      });

    return this.telegramBotClient.editMessageCaption({
      chatId,
      messageId,
      caption,
      parseMode: TGParseMode.HTML,
    });
  }

  async sendSubmissionFeedback(
    gig: PlainGig,
    chatId: TGChatId,
  ): Promise<TGMessage | undefined> {
    const composedSubmissionFeedbackPost: TGSendPhoto =
      this.telegramPostComposerService.composeSubmissionFeedbackPost(
        gig,
        chatId,
      );
    return this.telegramBotClient.sendPhoto(
      composedSubmissionFeedbackPost,
      String(gig._id),
    );
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
