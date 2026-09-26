import type { ExecutionContext } from '@nestjs/common';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import type { TelegramWebhookRequest } from './telegram-webhook.guard';

describe('TelegramWebhookGuard', () => {
  const guard = new TelegramWebhookGuard();
  const previousBotSecret = process.env.BOT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (previousBotSecret === undefined) {
      delete process.env.BOT_SECRET;
    } else {
      process.env.BOT_SECRET = previousBotSecret;
    }
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
