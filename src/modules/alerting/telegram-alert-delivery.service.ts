import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRequiredConfigString } from '@shared/utils/env';
import { TelegramBotClient } from '../telegram/telegram-bot-client/telegram-bot.client';
import { TGParseMode } from '../telegram/telegram-bot-client/types/message.types';
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

const ALERT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

@Injectable()
export class TelegramAlertDeliveryService implements AlertDelivery {
  private readonly alertsChannelId: string;

  constructor(
    private readonly telegramBotClient: TelegramBotClient,
    configService: ConfigService,
  ) {
    this.alertsChannelId = getRequiredConfigString(
      configService,
      'ALERTS_TELEGRAM_CHANNEL_ID',
    );
  }

  async send(params: DeliverAlertParams): Promise<void> {
    await this.telegramBotClient.sendMessage({
      chat_id: this.alertsChannelId,
      text: this.composeMessage(params),
      parse_mode: TGParseMode.HTML,
    });
  }

  private composeMessage(params: DeliverAlertParams): string {
    const lines = [
      this.formatSeverity(params.severity),
      '',
      this.escapeTelegramHtmlText(params.summary),
      '',
      this.formatField('Code', params.code),
      this.formatField('Time', this.formatOccurredAt(params.occurredAt)),
    ];

    if (params.attributes !== undefined) {
      const attributes = Object.entries(params.attributes).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      for (const [name, value] of attributes) {
        lines.push(this.formatField(name, value));
      }
    }

    return lines.join('\n');
  }

  private formatSeverity(severity: AlertSeverity): string {
    return ALERT_SEVERITY_HEADERS[severity];
  }

  private formatOccurredAt(occurredAt: Date): string {
    return ALERT_DATE_TIME_FORMATTER.format(occurredAt);
  }

  private formatField(name: string, value: AlertAttributeValue): string {
    const escapedName = this.escapeTelegramHtmlText(name);
    const escapedValue = this.escapeTelegramHtmlText(String(value));
    return `<b>${escapedName}:</b> ${escapedValue}`;
  }

  private escapeTelegramHtmlText(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
