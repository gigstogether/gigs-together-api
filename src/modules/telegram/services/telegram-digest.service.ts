import { Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { PlainGig } from '../../gig/types/gig.types';
import { isRecord } from '../../../shared/utils/is-record';
import { logError } from '../../../shared/utils/logging';
import { TelegramDigestComposerService } from '../composers/telegram-digest-composer.service';
import type { WeeklyDigestSendPlan } from '../composers/telegram-digest-composer.types';
import { WeeklyDigestSendKind } from '../composers/telegram-digest-composer.types';
import { TelegramBotClient } from '../telegram-bot.client';
import { TelegramPostComposerService } from '../telegram-post-composer.service';

export interface WeeklyDigestPostResult {
  postUrl: string;
}

@Injectable()
export class TelegramDigestService {
  private readonly logger = new Logger(TelegramDigestService.name);

  private static readonly WEBPAGE_CURL_FAILED_DESCRIPTION_PATTERN =
    /^Bad Request: failed to send message #([1-9]\d*) with the error message "WEBPAGE_CURL_FAILED"$/;

  constructor(
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramDigestComposer: TelegramDigestComposerService,
    private readonly telegramPostComposer: TelegramPostComposerService,
  ) {}

  async sendWeeklyDigestPost(
    gigs: PlainGig[],
  ): Promise<WeeklyDigestPostResult | undefined> {
    const chatId = (process.env.MAIN_CHANNEL_ID ?? '').trim();
    if (chatId === '') {
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
      const mediaFailure = this.getWeeklyDigestMediaFailureLogMeta(e, plan);
      logError(this.logger, {
        error: e,
        note: 'Weekly digest send to main channel failed',
        context: TelegramDigestService.name,
        ...(mediaFailure ? { meta: mediaFailure } : {}),
      });
      throw new Error('Weekly digest send to main channel failed');
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

    const postUrl = this.telegramPostComposer.getPostUrl({
      chatId,
      messageId,
    });
    return postUrl === undefined ? undefined : { postUrl };
  }

  private getWeeklyDigestMediaFailureLogMeta(
    e: unknown,
    plan: WeeklyDigestSendPlan | undefined,
  ): Record<string, unknown> | undefined {
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
