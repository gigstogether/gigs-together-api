import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CronTime } from 'cron';
import type { Model } from 'mongoose';
import type { GigDocument } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { TelegramService } from '../telegram/telegram.service';
import { getDigestUpcomingInclusiveDayRangeMs } from './digest-date-range';
import { DigestPostState } from './digest-post-state.schema';
import type { DigestPostStateDocument } from './digest-post-state.schema';

/** Monday 12:00 local (minute 0, hour 12, weekday Monday). */
export const DIGEST_POST_CRON_EXPRESSION = '0 12 * * 1';

export const DIGEST_POST_TIMEZONE = 'Europe/Madrid';

/**
 * Non-manual posts (cron, startup catch-up) run only within this long after the
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
 * Digest Telegram posting. {@link DigestCronService} triggers `createPost` on a schedule.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
    @InjectModel(DigestPostState.name)
    private readonly digestPostStateModel: Model<DigestPostStateDocument>,
  ) {}

  /**
   * Creates the weekly digest post in the main Telegram channel.
   */
  async createPost(): Promise<void> {
    const documents = await this.getDigestRangeDocuments();

    const postResult =
      await this.telegramService.sendWeeklyDigestPost(documents);

    const digestPostUrl = postResult?.postUrl;
    if (digestPostUrl) {
      await this.recordSuccessfulPost(digestPostUrl);
      this.logger.log(`Weekly digest posted successfully: ${digestPostUrl}`);
    }
  }

  async createPostIfEligible(): Promise<void> {
    const now = new Date();
    const lastEstimatedDigestCronFire = getPreviousEstimatedDigestCronFireDate({
      cronExpression: DIGEST_POST_CRON_EXPRESSION,
      timeZone: DIGEST_POST_TIMEZONE,
      now,
    });

    const postedAt = await this.getLatestPostDate();

    if (
      postedAt !== undefined &&
      postedAt.getTime() >= lastEstimatedDigestCronFire.getTime()
    ) {
      return;
    }

    const graceEndMs =
      lastEstimatedDigestCronFire.getTime() + DIGEST_CATCH_UP_GRACE_MS;
    if (now.getTime() > graceEndMs) {
      return;
    }

    await this.createPost();
  }

  private getDigestRangeDocuments(): Promise<GigDocument[]> {
    const { fromMs, toMs } = getDigestUpcomingInclusiveDayRangeMs(new Date());

    return this.gigService.getVisibleGigDocumentsInInclusiveMsRange({
      fromMs,
      toMs,
    });
  }

  private async getLatestPostDate(): Promise<Date | undefined> {
    const doc = await this.digestPostStateModel.findOne().lean().exec();
    return doc?.postedAt ?? undefined;
  }

  private async recordSuccessfulPost(postUrl: string): Promise<void> {
    await this.digestPostStateModel
      .findOneAndUpdate(
        {},
        {
          $set: {
            postedAt: new Date(),
            postUrl,
          },
        },
        { upsert: true },
      )
      .exec();
  }
}
