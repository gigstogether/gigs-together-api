import { Inject, Injectable, Logger } from '@nestjs/common';
import { logError } from '@shared/utils/logging';
import { ALERT_DELIVERY, AlertSeverity } from './alert-delivery';
import type { AlertDelivery, SendAlertParams } from './alert-delivery';

export interface ReportFailureBestEffortParams {
  alert: SendAlertParams;
  error: unknown;
  logContext: string;
  logNote: string;
}

interface ReportedFailureError {
  name: string;
  message: string;
  stack?: string;
}

interface ReportedFailureLogEntry {
  note: string;
  source: string;
  meta: Record<string, unknown>;
  error: ReportedFailureError;
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

    const errorDetails: ReportedFailureError = {
      name: error instanceof Error ? error.name : 'UnknownError',
      message:
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error',
    };
    if (
      alert.severity === AlertSeverity.Critical &&
      error instanceof Error &&
      error.stack !== undefined
    ) {
      errorDetails.stack = error.stack;
    }

    const logEntry: ReportedFailureLogEntry = {
      note: logNote,
      source: logContext,
      meta: {
        ...alert.attributes,
        alertCode: alert.code,
        severity: alert.severity,
      },
      error: errorDetails,
    };

    switch (alert.severity) {
      case AlertSeverity.Warning:
        this.logger.warn(logEntry);
        break;
      case AlertSeverity.Critical:
        this.logger.error(logEntry);
        break;
      default: {
        const unsupportedSeverity: never = alert.severity;
        throw new Error(`Unsupported alert severity: ${unsupportedSeverity}`);
      }
    }

    await this.sendBestEffort(alert);
  }
}
