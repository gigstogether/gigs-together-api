import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CronTime } from 'cron';
import type { Model } from 'mongoose';
import type { GigDocument } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { TelegramService } from '../telegram/telegram.service';
import { getDigestUpcomingInclusiveDayRangeMs } from './digest-date-range';
import { DigestPublicationState } from './digest-publication-state.schema';
import type { DigestPublicationStateDocument } from './digest-publication-state.schema';

/** Monday 12:00 local (minute 0, hour 12, weekday Monday). */
export const DIGEST_PUBLISH_CRON_EXPRESSION = '0 12 * * 1';

export const DIGEST_PUBLISH_TIMEZONE = 'Europe/Madrid';

/**
 * Non-manual publishes (cron, startup catch-up) run only within this long after the
 * implied cron instant (4 hours).
 */
const DIGEST_CATCH_UP_GRACE_MS = 14_400_000;

export interface GetPreviousDigestCronFireDateParams {
  readonly cronExpression: string;
  readonly timeZone: string;
  readonly now: Date;
}

/**
 * Previous digest cron instant: next matching tick from `now`, stepped back one calendar week.
 */
export function getPreviousEstimatedDigestCronFireDate(
  params: GetPreviousDigestCronFireDateParams,
): Date {
  const cronTime = new CronTime(params.cronExpression, params.timeZone);
  const next = cronTime.getNextDateFrom(params.now, params.timeZone);
  return next.minus({ weeks: 1 }).toJSDate();
}

/**
 * Digest Telegram publishing. {@link DigestCronService} triggers `publish` on a schedule.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
    @InjectModel(DigestPublicationState.name)
    private readonly digestPublicationStateModel: Model<DigestPublicationStateDocument>,
  ) {}

  /**
   * Publishes the weekly digest to the main Telegram channel (album + caption, or empty-range notice).
   */
  async publish(): Promise<void> {
    const documents = await this.getDigestRangeDocuments();

    const publishResult =
      await this.telegramService.publishWeeklyDigestToMainChannel(documents);

    const digestPostUrl = publishResult?.postUrl;
    if (digestPostUrl) {
      await this.recordSuccessfulPublication(digestPostUrl);
      this.logger.log(`Weekly digest published successfully: ${digestPostUrl}`);
    }
  }

  async publishIfEligible(): Promise<void> {
    const now = new Date();
    const lastEstimatedDigestCronFire = getPreviousEstimatedDigestCronFireDate({
      cronExpression: DIGEST_PUBLISH_CRON_EXPRESSION,
      timeZone: DIGEST_PUBLISH_TIMEZONE,
      now,
    });

    const publishedAt = await this.getLatestPublicationPublishedAt();

    if (
      publishedAt !== undefined &&
      publishedAt.getTime() >= lastEstimatedDigestCronFire.getTime()
    ) {
      return;
    }

    const graceEndMs =
      lastEstimatedDigestCronFire.getTime() + DIGEST_CATCH_UP_GRACE_MS;
    if (now.getTime() > graceEndMs) {
      return;
    }

    await this.publish();
  }

  private getDigestRangeDocuments(): Promise<GigDocument[]> {
    const { fromMs, toMs } = getDigestUpcomingInclusiveDayRangeMs(new Date());

    return this.gigService.getVisibleGigDocumentsInInclusiveMsRange({
      fromMs,
      toMs,
    });
  }

  private async getLatestPublicationPublishedAt(): Promise<Date | undefined> {
    const doc = await this.digestPublicationStateModel.findOne().lean().exec();
    return doc?.publishedAt ?? undefined;
  }

  private async recordSuccessfulPublication(postUrl: string): Promise<void> {
    await this.digestPublicationStateModel
      .findOneAndUpdate(
        {},
        {
          $set: {
            publishedAt: new Date(),
            postUrl,
          },
        },
        { upsert: true },
      )
      .exec();
  }
}
