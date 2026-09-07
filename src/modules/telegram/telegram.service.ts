import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TGMessage, TGSendPhoto } from './types/message.types';
import { TGParseMode } from './types/message.types';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { logError } from '../../shared/utils/logging';
import { TelegramBotClient } from './telegram-bot.client';
import type { PlainGig } from '../gig/types/gig.types';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import type { GigCandidatePost } from '../gig-candidate/types/gig-candidate.types';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import type {
  UpdateGigModerationPostPayload,
  UpdateRejectedGigCandidatePostPayload,
  WeeklyDigestPostResult,
} from './types/telegram.service.types';
import {
  PostEditKind,
  WeeklyDigestMainChannelSendKind,
  WeeklyDigestMainChannelSendPlan,
  ComposeGigCandidateFeedbackMessageParams,
} from './types/telegram-post-composer.service.types';

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
   * Updates an existing post in the main channel (caption/text).
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

    try {
      const plan: WeeklyDigestMainChannelSendPlan =
        this.telegramPostComposerService.composeWeeklyDigest({
          chatId,
          gigs,
        });

      const sentPost = await this.dispatchWeeklyDigestMainChannelPlan(plan);
      if (sentPost === undefined) {
        throw new Error(
          'Weekly digest send finished without a Telegram message_id or post URL',
        );
      }

      return sentPost;
    } catch (e: unknown) {
      logError(this.logger, {
        error: e,
        note: 'Weekly digest send to main channel failed',
        context: TelegramService.name,
      });
      throw e;
    }
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

  sendMainPost(gig: PlainGig): Promise<TGMessage | undefined> {
    const composedMainPost: TGSendPhoto =
      this.telegramPostComposerService.composeMainPost(gig);
    return this.telegramBotClient.sendPhoto(composedMainPost, String(gig._id));
  }

  sendGigCandidateIntakePost(
    gigCandidate: GigCandidate,
  ): Promise<TGMessage | undefined> {
    const composed =
      this.telegramPostComposerService.composeGigCandidateIntakePost(
        gigCandidate,
      );
    return this.telegramBotClient.sendPhoto(composed, gigCandidate.id);
  }

  sendGigCandidateModerationPost(
    gigCandidate: GigCandidate,
  ): Promise<TGMessage | undefined> {
    const composed =
      this.telegramPostComposerService.composeGigCandidateModerationPost(
        gigCandidate,
      );
    return this.telegramBotClient.sendPhoto(composed, gigCandidate.id);
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

  async removeGigCandidateIntakeActions(
    intakePost: GigCandidatePost,
  ): Promise<void> {
    await this.telegramBotClient.editMessageReplyMarkup({
      chatId: intakePost.chatId,
      messageId: intakePost.id,
      replyMarkup: { inline_keyboard: [] },
    });
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
    } = payload;

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
        mainPostUrl,
        editGigUrl,
      });

    const caption =
      this.telegramPostComposerService.buildGigModerationPostCaption({
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
