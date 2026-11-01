import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ALERT_DELIVERY, AlertSeverity } from './alert-delivery';
import type { AlertDelivery, SendAlertParams } from './alert-delivery';
import { AlertingService, AlertLogLevel } from './alerting.service';

describe('AlertingService', () => {
  let service: AlertingService;

  const alertDeliverySendMock = vi.fn<AlertDelivery['send']>();
  const params: SendAlertParams = {
    code: 'testAlertDelivery',
    severity: AlertSeverity.Warning,
    summary: 'Test alert delivery.',
    attributes: {
      entityId: 'entity-id',
    },
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T12:30:00.000Z'));
    alertDeliverySendMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertingService,
        {
          provide: ALERT_DELIVERY,
          useValue: {
            send: alertDeliverySendMock,
          } satisfies AlertDelivery,
        },
      ],
    }).compile();

    service = module.get<AlertingService>(AlertingService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should send an alert with its occurrence time', async () => {
    await service.send(params);

    expect(alertDeliverySendMock).toHaveBeenCalledWith({
      ...params,
      occurredAt: new Date('2026-10-30T12:30:00.000Z'),
    });
  });

  it('should propagate a delivery failure from required sending', async () => {
    const deliveryFailure = new Error('Telegram is unavailable');
    alertDeliverySendMock.mockRejectedValueOnce(deliveryFailure);

    await expect(service.send(params)).rejects.toBe(deliveryFailure);
  });

  it('should log a delivery failure from best-effort sending', async () => {
    const deliveryFailure = new Error('Telegram is unavailable');
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    alertDeliverySendMock.mockRejectedValueOnce(deliveryFailure);

    await service.sendBestEffort(params);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Alert delivery failed; the application operation will continue',
        context: AlertingService.name,
        meta: {
          alertCode: params.code,
          severity: params.severity,
        },
        message: deliveryFailure.message,
      }),
      deliveryFailure.stack,
    );
  });

  it('should log an application failure with structured alert context', async () => {
    const applicationFailure = new Error('Application operation failed');
    const loggerWarnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await service.reportFailureBestEffort({
      alert: params,
      error: applicationFailure,
      logContext: 'TestApplicationService',
      logNote: 'Test application operation failed',
      logLevel: AlertLogLevel.Warning,
      isStackTraceIncluded: false,
    });

    expect(loggerWarnSpy).toHaveBeenCalledWith({
      note: 'Test application operation failed',
      source: 'TestApplicationService',
      meta: {
        entityId: 'entity-id',
        alertCode: params.code,
        severity: params.severity,
      },
      error: {
        name: applicationFailure.name,
        message: applicationFailure.message,
      },
    });
  });

  it('should log at error level with a stack independently from alert severity', async () => {
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const applicationFailure = new Error('Application operation failed');

    await service.reportFailureBestEffort({
      alert: params,
      error: applicationFailure,
      logContext: 'TestApplicationService',
      logNote: 'Application operation failed',
      logLevel: AlertLogLevel.Error,
      isStackTraceIncluded: true,
    });

    expect(loggerErrorSpy).toHaveBeenCalledOnce();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'TestApplicationService',
        meta: expect.objectContaining({
          alertCode: params.code,
          severity: AlertSeverity.Warning,
        }),
        error: {
          name: applicationFailure.name,
          message: applicationFailure.message,
          stack: applicationFailure.stack,
        },
      }),
    );
  });

  it('should deliver the alert when reporting an application failure', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await service.reportFailureBestEffort({
      alert: params,
      error: new Error('Application operation failed'),
      logContext: 'TestApplicationService',
      logNote: 'Test application operation failed',
      logLevel: AlertLogLevel.Error,
      isStackTraceIncluded: false,
    });

    expect(alertDeliverySendMock).toHaveBeenCalledWith({
      ...params,
      occurredAt: new Date('2026-10-30T12:30:00.000Z'),
    });
  });

  it('should not reject failure reporting when alert delivery fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    alertDeliverySendMock.mockRejectedValueOnce(
      new Error('Telegram is unavailable'),
    );

    await expect(
      service.reportFailureBestEffort({
        alert: params,
        error: new Error('Application operation failed'),
        logContext: 'TestApplicationService',
        logNote: 'Test application operation failed',
        logLevel: AlertLogLevel.Error,
        isStackTraceIncluded: false,
      }),
    ).resolves.toBeUndefined();
  });
});
