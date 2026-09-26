import { TelegramUpdatesController } from './telegram-updates.controller';
import type { TelegramUpdatesService } from './telegram-updates.service';
import type { TelegramWebhookRequest } from './guards/telegram-webhook.guard';
import type { TGUpdate } from '../telegram/types/update.types';

describe('TelegramUpdatesController', () => {
  const telegramUpdatesService = {
    handleMessage: vi.fn(),
    handleCallbackQuery: vi.fn(),
  };
  const controller = new TelegramUpdatesController(
    telegramUpdatesService as unknown as TelegramUpdatesService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    telegramUpdatesService.handleMessage.mockResolvedValue(undefined);
    telegramUpdatesService.handleCallbackQuery.mockResolvedValue(undefined);
  });

  it('should route a public message from an authenticated webhook', async () => {
    const message: NonNullable<TGUpdate['message']> = {
      message_id: 10,
      date: 1,
      text: '/start',
      chat: { id: 42, type: 'private' },
      from: {
        id: 42,
        is_bot: false,
        first_name: 'Arina',
      },
    };

    await controller.handleUpdate(createRequest(true), {
      update_id: 1,
      message,
    });

    expect(telegramUpdatesService.handleMessage).toHaveBeenCalledWith(message);
  });

  it('should route a callback for authorization in the service', async () => {
    const callbackQuery: NonNullable<TGUpdate['callback_query']> = {
      id: 'callback-1',
      from: {
        id: 42,
        is_bot: false,
        first_name: 'Arina',
      },
    };

    await controller.handleUpdate(createRequest(true), {
      update_id: 1,
      callback_query: callbackQuery,
    });

    expect(telegramUpdatesService.handleCallbackQuery).toHaveBeenCalledWith(
      callbackQuery,
    );
  });

  it('should ignore an unauthenticated webhook update', async () => {
    await controller.handleUpdate(createRequest(false), {
      update_id: 1,
      message: {
        message_id: 10,
        date: 1,
        text: '/start',
        chat: { id: 42, type: 'private' },
      },
    });

    expect(telegramUpdatesService.handleMessage).not.toHaveBeenCalled();
    expect(telegramUpdatesService.handleCallbackQuery).not.toHaveBeenCalled();
  });
});

function createRequest(isAuthenticated: boolean): TelegramWebhookRequest {
  return {
    telegramWebhook: isAuthenticated
      ? { isAuthenticated: true }
      : { isAuthenticated: false, reason: 'Invalid secret token' },
  } as TelegramWebhookRequest;
}
