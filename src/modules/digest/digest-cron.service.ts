import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DigestService,
  DIGEST_POST_CRON_EXPRESSION,
  DIGEST_POST_TIMEZONE,
} from './digest.service';
import { AlertSeverity } from '@modules/alerting/alert-delivery';
import type {
  AlertAttributeValue,
  AlertDefinition,
} from '@modules/alerting/alert-delivery';
import {
  AlertingService,
  AlertLogLevel,
} from '@modules/alerting/alerting.service';
import { DigestDeliveryError } from './digest-delivery';

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
    const attributes: Record<string, AlertAttributeValue> = {
      operation: 'createWeeklyDigestPost',
      trigger: params.trigger,
      cronExpression: DIGEST_POST_CRON_EXPRESSION,
      timeZone: DIGEST_POST_TIMEZONE,
    };
    if (params.error instanceof DigestDeliveryError) {
      attributes.deliveryProvider = params.error.provider;
      attributes.providerOperation = params.error.providerOperation;
      if (params.error.status !== undefined) {
        attributes.status = params.error.status;
      }
      if (params.error.code !== undefined) {
        attributes.code = params.error.code;
      }
      if (params.error.providerErrorCode !== undefined) {
        attributes.providerErrorCode = params.error.providerErrorCode;
      }
      if (params.error.providerDescription !== undefined) {
        attributes.providerDescription = params.error.providerDescription;
      }
      if (params.error.providerFailureCode !== undefined) {
        attributes.providerFailureCode = params.error.providerFailureCode;
      }
      if (params.error.failedItemPosition !== undefined) {
        attributes.failedItemPosition = params.error.failedItemPosition;
      }
      if (params.error.gigPublicId !== undefined) {
        attributes.gigPublicId = params.error.gigPublicId;
      }
      if (params.error.mediaUrl !== undefined) {
        attributes.mediaUrl = params.error.mediaUrl;
      }
    }

    return this.alertingService.reportFailureBestEffort({
      alert: {
        ...WEEKLY_DIGEST_POST_FAILED_ALERT,
        attributes,
      },
      error: params.error,
      logContext: DigestCronService.name,
      logNote,
      logLevel: AlertLogLevel.Error,
      isStackTraceIncluded: !(params.error instanceof DigestDeliveryError),
    });
  }
}
