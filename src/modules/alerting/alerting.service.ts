import { Inject, Injectable, Logger } from '@nestjs/common';
import { logError } from '@shared/utils/logging';
import { ALERT_DELIVERY } from './alert-delivery';
import type { AlertDelivery, SendAlertParams } from './alert-delivery';

export interface ReportFailureBestEffortParams {
  alert: SendAlertParams;
  error: unknown;
  logContext: string;
  logNote: string;
}

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(
    @Inject(ALERT_DELIVERY)
    private readonly alertDelivery: AlertDelivery,
  ) {}

  send(params: SendAlertParams): Promise<void> {
    return this.alertDelivery.send({
      ...params,
      occurredAt: new Date(),
    });
  }

  async sendBestEffort(params: SendAlertParams): Promise<void> {
    try {
      await this.send(params);
    } catch (e) {
      logError(this.logger, {
        error: e,
        note: 'Alert delivery failed; the application operation will continue',
        context: AlertingService.name,
        meta: {
          alertCode: params.code,
          severity: params.severity,
        },
      });
    }
  }

  async reportFailureBestEffort(
    params: ReportFailureBestEffortParams,
  ): Promise<void> {
    const { alert, error, logContext, logNote } = params;

    logError(this.logger, {
      error,
      note: logNote,
      context: logContext,
      meta: {
        ...alert.attributes,
        alertCode: alert.code,
        severity: alert.severity,
      },
    });

    await this.sendBestEffort(alert);
  }
}
