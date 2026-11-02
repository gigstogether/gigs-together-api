export const ALERT_DELIVERY = Symbol('ALERT_DELIVERY');

export enum AlertSeverity {
  Warning = 'warning',
  Critical = 'critical',
}

export type AlertAttributeValue = string | number | boolean;

export interface AlertDefinition {
  code: string;
  severity: AlertSeverity;
  summary: string;
}

export interface SendAlertParams extends AlertDefinition {
  attributes?: Record<string, AlertAttributeValue>;
}

export interface DeliverAlertParams extends SendAlertParams {
  occurredAt: Date;
}

export interface AlertDelivery {
  send(params: DeliverAlertParams): Promise<void>;
}
