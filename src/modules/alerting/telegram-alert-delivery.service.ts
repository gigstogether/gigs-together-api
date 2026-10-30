import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRequiredConfigString } from '@shared/utils/env';
import { TelegramService } from '../telegram/telegram.service';
import { AlertSeverity } from './alert-delivery';
import type {
  AlertAttributeValue,
  AlertDelivery,
  DeliverAlertParams,
} from './alert-delivery';

const ALERT_SEVERITY_HEADERS = {
  [AlertSeverity.Warning]: '⚠️ WARNING',
  [AlertSeverity.Critical]: '🔴 CRITICAL',
} satisfies Record<AlertSeverity, string>;

@Injectable()
export class TelegramAlertDeliveryService implements AlertDelivery {
  private readonly alertsChannelId: string;

  constructor(
    private readonly telegramService: TelegramService,
    configService: ConfigService,
  ) {
    this.alertsChannelId = getRequiredConfigString(
      configService,
      'ALERTS_TELEGRAM_CHANNEL_ID',
    );
  }

  async send(params: DeliverAlertParams): Promise<void> {
    await this.telegramService.sendMessage({
      chat_id: this.alertsChannelId,
      text: this.composeMessage(params),
    });
  }

  private composeMessage(params: DeliverAlertParams): string {
    const lines = [
      this.formatSeverity(params.severity),
      '',
      params.summary,
      '',
      `Code: ${params.code}`,
      `Time: ${params.occurredAt.toISOString()}`,
    ];

    if (params.attributes !== undefined) {
      const attributes = Object.entries(params.attributes).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      for (const [name, value] of attributes) {
        lines.push(`${name}: ${this.formatAttributeValue(value)}`);
      }
    }

    return lines.join('\n');
  }

  private formatSeverity(severity: AlertSeverity): string {
    return ALERT_SEVERITY_HEADERS[severity];
  }

  private formatAttributeValue(value: AlertAttributeValue): string {
    return String(value);
  }
}
