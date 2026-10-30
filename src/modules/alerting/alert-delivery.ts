export const ALERT_DELIVERY = Symbol('ALERT_DELIVERY');

export enum AlertSeverity {
  Warning = 'warning',
  Critical = 'critical',
}

export enum AlertCode {
  GigCalendarEventCreationFailed = 'gigCalendarEventCreationFailed',
}

export type AlertAttributeValue = string | number | boolean;

export interface SendAlertParams {
  code: AlertCode;
  severity: AlertSeverity;
  summary: string;
  attributes?: Record<string, AlertAttributeValue>;
}

export interface DeliverAlertParams extends SendAlertParams {
  occurredAt: Date;
}

export interface AlertDelivery {
  send(params: DeliverAlertParams): Promise<void>;
}
