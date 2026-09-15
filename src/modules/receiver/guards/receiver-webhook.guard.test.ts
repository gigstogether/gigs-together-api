import type { ExecutionContext } from '@nestjs/common';
import type { AuthorizationService } from '../../auth/authorization.service';
import type { UserService } from '../../user/user.service';
import { ReceiverWebhookGuard } from './receiver-webhook.guard';
import type { ReceiverWebhookRequest } from './receiver-webhook.guard';

describe('ReceiverWebhookGuard', () => {
  const authorizationService = { isAdmin: vi.fn() };
  const userService = { findOrCreateMessengerUser: vi.fn() };
  const guard = new ReceiverWebhookGuard(
    authorizationService as unknown as AuthorizationService,
    userService as unknown as UserService,
  );
  const previousBotSecret = process.env.BOT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_SECRET = 'test-secret';
    userService.findOrCreateMessengerUser.mockResolvedValue({
      id: '66a000000000000000000001',
    });
    authorizationService.isAdmin.mockResolvedValue(true);
  });

  afterAll(() => {
    if (previousBotSecret === undefined) {
      delete process.env.BOT_SECRET;
    } else {
      process.env.BOT_SECRET = previousBotSecret;
    }
  });

  it('should authorize a Telegram webhook through the internal User id', async () => {
    const request = createRequest('test-secret');

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(userService.findOrCreateMessengerUser).toHaveBeenCalledWith({
      messenger: 'Telegram',
      externalUserId: '42',
      username: 'arina',
      displayName: 'Arina Goodboy',
    });
    expect(authorizationService.isAdmin).toHaveBeenCalledWith(
      '66a000000000000000000001',
    );
    expect(request.telegramWebhook).toEqual({
      allowed: true,
      userId: '66a000000000000000000001',
    });
  });

  it('should deny a valid webhook when the internal User is not an Admin', async () => {
    authorizationService.isAdmin.mockResolvedValue(false);
    const request = createRequest('test-secret');

    await guard.canActivate(createContext(request));

    expect(request.telegramWebhook).toEqual({
      allowed: false,
      reason: 'Admin privileges required',
    });
  });

  it('should not resolve a User when the webhook secret is invalid', async () => {
    const request = createRequest('wrong-secret');

    await guard.canActivate(createContext(request));

    expect(userService.findOrCreateMessengerUser).not.toHaveBeenCalled();
    expect(authorizationService.isAdmin).not.toHaveBeenCalled();
    expect(request.telegramWebhook).toEqual({
      allowed: false,
      reason: 'Invalid secret token',
    });
  });
});

function createRequest(secret: string): ReceiverWebhookRequest {
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
  } as unknown as ReceiverWebhookRequest;
}

function createContext(request: ReceiverWebhookRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
