import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TelegramBotClient } from '../telegram/telegram-bot-client/telegram-bot.client';
import { TGParseMode } from '../telegram/telegram-bot-client/types/message.types';
import { AlertSeverity } from './alert-delivery';
import type { DeliverAlertParams } from './alert-delivery';
import { TelegramAlertDeliveryService } from './telegram-alert-delivery.service';

describe('TelegramAlertDeliveryService', () => {
  let service: TelegramAlertDeliveryService;

  const sendMessageMock = vi.fn<TelegramBotClient['sendMessage']>();
  const params: DeliverAlertParams = {
    code: 'testTelegramAlertDelivery',
    severity: AlertSeverity.Warning,
    summary: 'Test Telegram alert delivery.',
    occurredAt: new Date('2026-10-30T12:30:00.000Z'),
    attributes: {
      gigId: 'gig-id',
      attempt: 2,
      isRetryable: true,
    },
  };

  beforeEach(async () => {
    vi.stubEnv('ALERTS_TELEGRAM_CHANNEL_ID', '-1001234567890');
    sendMessageMock.mockResolvedValue({
      message_id: 42,
      chat: {
        id: -1001234567890,
        type: 'channel',
      },
      date: Date.parse('2026-10-30T12:30:00.000Z') / 1_000,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramAlertDeliveryService,
        {
          provide: TelegramBotClient,
          useValue: {
            sendMessage: sendMessageMock,
          },
        },
        ConfigService,
      ],
    }).compile();

    service = module.get<TelegramAlertDeliveryService>(
      TelegramAlertDeliveryService,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should send a warning alert to the configured Telegram channel', async () => {
    await service.send(params);

    expect(sendMessageMock).toHaveBeenCalledWith({
      chat_id: '-1001234567890',
      parse_mode: TGParseMode.HTML,
      text: [
        '⚠️ WARNING',
        '',
        'Test Telegram alert delivery.',
        '',
        '<b>Code:</b> testTelegramAlertDelivery',
        '<b>Time:</b> 2026-10-30T12:30:00.000Z',
        '<b>attempt:</b> 2',
        '<b>gigId:</b> gig-id',
        '<b>isRetryable:</b> true',
      ].join('\n'),
    });
  });

  it('should escape dynamic HTML content in an alert', async () => {
    await service.send({
      ...params,
      code: 'alert<code>',
      summary: 'Calendar & Telegram <failure>',
      attributes: {
        'entity<id>': 'gig&candidate',
      },
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: [
          '⚠️ WARNING',
          '',
          'Calendar &amp; Telegram &lt;failure&gt;',
          '',
          '<b>Code:</b> alert&lt;code&gt;',
          '<b>Time:</b> 2026-10-30T12:30:00.000Z',
          '<b>entity&lt;id&gt;:</b> gig&amp;candidate',
        ].join('\n'),
      }),
    );
  });

  it('should send a critical alert with a critical header', async () => {
    await service.send({
      ...params,
      severity: AlertSeverity.Critical,
      attributes: undefined,
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/^🔴 CRITICAL\n/),
      }),
    );
  });

  it('should propagate a Telegram delivery failure', async () => {
    const deliveryFailure = new Error('Telegram is unavailable');
    sendMessageMock.mockRejectedValueOnce(deliveryFailure);

    await expect(service.send(params)).rejects.toBe(deliveryFailure);
  });

  it('should reject missing Telegram alert channel configuration', async () => {
    vi.stubEnv('ALERTS_TELEGRAM_CHANNEL_ID', '');

    const modulePromise = Test.createTestingModule({
      providers: [
        TelegramAlertDeliveryService,
        {
          provide: TelegramBotClient,
          useValue: {
            sendMessage: sendMessageMock,
          },
        },
        ConfigService,
      ],
    }).compile();

    await expect(modulePromise).rejects.toThrow(
      'ALERTS_TELEGRAM_CHANNEL_ID is not configured.',
    );
  });
});
