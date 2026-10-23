import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import type { TelegramWebhookRequest } from './telegram-webhook.guard';

describe('TelegramWebhookGuard', () => {
  let guard: TelegramWebhookGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new TelegramWebhookGuard(
      new ConfigService({ BOT_SECRET: 'test-secret' }),
    );
  });

  it('should reject construction when BOT_SECRET is empty', () => {
    expect(
      () => new TelegramWebhookGuard(new ConfigService({ BOT_SECRET: '   ' })),
    ).toThrowError('BOT_SECRET is not configured.');
  });

  it('should authenticate a Telegram webhook with a valid secret', () => {
    const request = createRequest('test-secret');

    expect(guard.canActivate(createContext(request))).toBe(true);
    expect(request.telegramWebhook).toEqual({
      isAuthenticated: true,
    });
  });

  it('should reject a Telegram webhook with an invalid secret', () => {
    const request = createRequest('wrong-secret');

    guard.canActivate(createContext(request));

    expect(request.telegramWebhook).toEqual({
      isAuthenticated: false,
      reason: 'Invalid secret token',
    });
  });
});

function createRequest(secret: string): TelegramWebhookRequest {
  return {
    headers: { 'x-telegram-bot-api-secret-token': secret },
    body: {
      update_id: 1,
      message: {
        message_id: 10,
        date: 1,
        chat: { id: 42, type: 'private' },
        from: {
          id: 42,
          first_name: 'Arina',
          last_name: 'Goodboy',
          username: 'arina',
        },
      },
    },
  } as unknown as TelegramWebhookRequest;
}

function createContext(request: TelegramWebhookRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
