import { ConsoleLogger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingTranslationError } from '../../translation/translation.errors';
import { TelegramWebhookExceptionFilter } from './telegram-webhook-exception.filter';

describe('TelegramWebhookExceptionFilter', () => {
  let filter: TelegramWebhookExceptionFilter;

  const setContextMock = vi.fn();
  const loggerErrorMock = vi.fn();

  beforeEach(async () => {
    setContextMock.mockReset();
    loggerErrorMock.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramWebhookExceptionFilter,
        {
          provide: ConsoleLogger,
          useValue: {
            setContext: setContextMock,
            error: loggerErrorMock,
          },
        },
      ],
    }).compile();

    filter = moduleRef.get(TelegramWebhookExceptionFilter);
  });

  it('should log a concise message without a stack when a translation is missing', () => {
    const sendMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ send: sendMock });
    const host = new ExecutionContextHost([
      {
        method: 'POST',
        url: '/v1/telegram/updates',
      },
      {
        status: statusMock,
      },
    ]);
    const exception = new MissingTranslationError({
      namespace: 'telegram',
      key: 'command.suggest.privateUnavailable',
      locale: 'en',
    });

    filter.catch(exception, host);

    expect(loggerErrorMock).toHaveBeenCalledOnce();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Missing translation key="command.suggest.privateUnavailable" namespace="telegram" locale="en" while handling POST /v1/telegram/updates; responding 200 to suppress Telegram retries.',
    );
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(sendMock).toHaveBeenCalledOnce();
  });
});
