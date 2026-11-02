import { Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { PlainGig } from '../../gig/types/gig.types';
import { isRecord } from '@shared/utils/is-record';
import { formatErrorMessage } from '@shared/utils/logging';
import { TelegramDigestComposerService } from './telegram-digest-composer.service';
import type { WeeklyDigestSendPlan } from './telegram-digest-composer.types';
import { WeeklyDigestSendKind } from './telegram-digest-composer.types';
import { TelegramDigestSendError } from './telegram-digest.error';
import type { TelegramDigestSendErrorParams } from './telegram-digest.error';
import { TelegramBotClient } from '../telegram-bot-client/telegram-bot.client';
import { TelegramComposerService } from '../telegram-composer.service';
import { TelegramService } from '../telegram.service';

export interface WeeklyDigestPostResult {
  postUrl: string;
}

interface WeeklyDigestMediaFailureDetails {
  telegramError: string;
  mediaPosition: number;
  gigPublicId?: string;
  posterUrl?: string;
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

@Injectable()
export class TelegramDigestService {
  private readonly logger = new Logger(TelegramDigestService.name);

  private static readonly WEBPAGE_CURL_FAILED_DESCRIPTION_PATTERN =
    /^Bad Request: failed to send message #([1-9]\d*) with the error message "WEBPAGE_CURL_FAILED"$/;

  constructor(
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramDigestComposer: TelegramDigestComposerService,
    private readonly telegramComposer: TelegramComposerService,
    private readonly telegramService: TelegramService,
  ) {}

  async sendWeeklyDigestPost(
    gigs: PlainGig[],
  ): Promise<WeeklyDigestPostResult | undefined> {
    const chatId = this.telegramService.getMainChannelId();
    if (chatId === undefined) {
      this.logger.warn(
        'sendWeeklyDigestPost skipped: MAIN_CHANNEL_ID is empty',
      );
      return;
    }

    let plan: WeeklyDigestSendPlan | undefined;
    try {
      plan = this.telegramDigestComposer.composeWeeklyDigest({ chatId, gigs });

      const postResult = await this.dispatchWeeklyDigestPlan(plan);
      if (postResult === undefined) {
        throw new Error(
          'Weekly digest send finished without a Telegram message_id or post URL',
        );
      }

      return postResult;
    } catch (e: unknown) {
      throw this.createSendError(e, plan);
    }
  }

  private createSendError(
    e: unknown,
    plan: WeeklyDigestSendPlan | undefined,
  ): TelegramDigestSendError {
    const providerOperation = this.getProviderOperation(plan);
    const errorParams: TelegramDigestSendErrorParams = {
      message: `Telegram weekly digest send failed: ${formatErrorMessage(e)}`,
      cause: e,
      providerOperation,
    };

    if (isAxiosError(e)) {
      if (typeof e.response?.status === 'number') {
        errorParams.status = e.response.status;
      }
      if (isStringOrNumber(e.code)) {
        errorParams.code = e.code;
      }
      const responseData: unknown = e.response?.data;
      if (isRecord(responseData)) {
        if (typeof responseData.error_code === 'number') {
          errorParams.telegramErrorCode = responseData.error_code;
        }
        if (typeof responseData.description === 'string') {
          errorParams.telegramDescription = responseData.description;
          errorParams.message = `Telegram weekly digest send failed: ${responseData.description}`;
        }
      }
    }

    const mediaFailure = this.getWeeklyDigestMediaFailureDetails(e, plan);
    if (mediaFailure !== undefined) {
      errorParams.telegramError = mediaFailure.telegramError;
      errorParams.mediaPosition = mediaFailure.mediaPosition;
      if (mediaFailure.gigPublicId !== undefined) {
        errorParams.gigPublicId = mediaFailure.gigPublicId;
      }
      if (mediaFailure.posterUrl !== undefined) {
        errorParams.posterUrl = mediaFailure.posterUrl;
      }
    }

    return new TelegramDigestSendError(errorParams);
  }

  private getProviderOperation(plan: WeeklyDigestSendPlan | undefined): string {
    if (plan === undefined) {
      return 'composeWeeklyDigest';
    }
    switch (plan.kind) {
      case WeeklyDigestSendKind.SendMessage:
        return 'sendMessage';
      case WeeklyDigestSendKind.SendPhoto:
        return 'sendPhoto';
      case WeeklyDigestSendKind.SendMediaGroup:
        return 'sendMediaGroup';
    }
  }

  private async dispatchWeeklyDigestPlan(
    plan: WeeklyDigestSendPlan,
  ): Promise<WeeklyDigestPostResult | undefined> {
    const chatId = plan.payload.chat_id;

    let messageId: number | undefined;
    switch (plan.kind) {
      case WeeklyDigestSendKind.SendMessage: {
        const message = await this.telegramBotClient.sendMessage(plan.payload);
        messageId = message.message_id;
        break;
      }
      case WeeklyDigestSendKind.SendPhoto: {
        const message = await this.telegramBotClient.sendPhoto(plan.payload);
        messageId = message?.message_id;
        break;
      }
      case WeeklyDigestSendKind.SendMediaGroup: {
        const messages = await this.telegramBotClient.sendMediaGroup(
          plan.payload,
        );
        messageId = messages[0]?.message_id;
        break;
      }
    }

    if (messageId === undefined) {
      return;
    }

    const postUrl = this.telegramComposer.buildPostUrl({
      chatId,
      messageId,
    });
    return postUrl === undefined ? undefined : { postUrl };
  }

  private getWeeklyDigestMediaFailureDetails(
    e: unknown,
    plan: WeeklyDigestSendPlan | undefined,
  ): WeeklyDigestMediaFailureDetails | undefined {
    const position = this.parseWebpageCurlFailedPosition(e);
    if (
      position === undefined ||
      plan?.kind !== WeeklyDigestSendKind.SendMediaGroup
    ) {
      return;
    }

    const mediaItem = plan.mediaItems.find(
      (item) => item.position === position,
    );
    const media = plan.payload.media[position - 1];
    const details: WeeklyDigestMediaFailureDetails = {
      telegramError: 'WEBPAGE_CURL_FAILED',
      mediaPosition: position,
    };
    if (mediaItem === undefined || media === undefined) {
      return details;
    }

    details.gigPublicId = mediaItem.publicId;
    const posterUrl = this.getSafeTelegramPosterUrlForLog(media.media);
    if (posterUrl !== undefined) {
      details.posterUrl = posterUrl;
    }
    return details;
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

    const match =
      TelegramDigestService.WEBPAGE_CURL_FAILED_DESCRIPTION_PATTERN.exec(
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
}
