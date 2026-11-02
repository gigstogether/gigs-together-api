import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DigestService,
  DIGEST_POST_CRON_EXPRESSION,
  DIGEST_POST_TIMEZONE,
} from './digest.service';
import { AlertSeverity } from '@modules/alerting/alert-delivery';
import type { AlertDefinition } from '@modules/alerting/alert-delivery';
import {
  AlertingService,
  AlertLogLevel,
} from '@modules/alerting/alerting.service';

const WEEKLY_DIGEST_POST_FAILED_ALERT = {
  code: 'weeklyDigestPostFailed',
  severity: AlertSeverity.Warning,
  summary: 'Weekly digest post failed.',
} satisfies AlertDefinition;

type WeeklyDigestRunTrigger = 'scheduled' | 'startupCatchUp';

interface ReportWeeklyDigestFailureParams {
  error: unknown;
  trigger: WeeklyDigestRunTrigger;
}

@Injectable()
export class DigestCronService implements OnModuleInit {
  private readonly logger = new Logger(DigestCronService.name);

  constructor(
    private readonly digestService: DigestService,
    private readonly alertingService: AlertingService,
  ) {}

  onModuleInit(): void {
    void this.createWeeklyDigestPostOnStartup();
  }

  @Cron(DIGEST_POST_CRON_EXPRESSION, {
    name: 'digestWeeklyPost',
    timeZone: DIGEST_POST_TIMEZONE,
  })
  async createWeeklyDigestPostScheduled(): Promise<void> {
    this.logger.log('Scheduled weekly digest post started');
    try {
      await this.digestService.createPostIfEligible();
    } catch (e) {
      await this.reportWeeklyDigestFailure({
        error: e,
        trigger: 'scheduled',
      });
      throw e;
    }
  }

  private async createWeeklyDigestPostOnStartup(): Promise<void> {
    try {
      await this.digestService.createPostIfEligible();
    } catch (e) {
      await this.reportWeeklyDigestFailure({
        error: e,
        trigger: 'startupCatchUp',
      });
    }
  }

  private reportWeeklyDigestFailure(
    params: ReportWeeklyDigestFailureParams,
  ): Promise<void> {
    const logNote =
      params.trigger === 'startupCatchUp'
        ? 'Startup weekly digest catch-up failed; application will continue running'
        : 'Scheduled weekly digest post failed';

    return this.alertingService.reportFailureBestEffort({
      alert: {
        ...WEEKLY_DIGEST_POST_FAILED_ALERT,
        attributes: {
          operation: 'createPostIfEligible',
          trigger: params.trigger,
          cronExpression: DIGEST_POST_CRON_EXPRESSION,
          timeZone: DIGEST_POST_TIMEZONE,
        },
      },
      error: params.error,
      logContext: DigestCronService.name,
      logNote,
      logLevel: AlertLogLevel.Error,
      isStackTraceIncluded: true,
    });
  }
}
