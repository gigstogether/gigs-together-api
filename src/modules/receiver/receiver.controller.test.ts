import { ReceiverController } from './receiver.controller';
import type { ReceiverService } from './receiver.service';
import type { ReceiverWebhookRequest } from './guards/receiver-webhook.guard';
import type { TGUpdate } from '../telegram/types/update.types';

describe('ReceiverController', () => {
  const receiverService = {
    handleMessage: vi.fn(),
    handleCallbackQuery: vi.fn(),
  };
  const controller = new ReceiverController(
    receiverService as unknown as ReceiverService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    receiverService.handleMessage.mockResolvedValue(undefined);
    receiverService.handleCallbackQuery.mockResolvedValue(undefined);
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

    expect(receiverService.handleMessage).toHaveBeenCalledWith(message);
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

    expect(receiverService.handleCallbackQuery).toHaveBeenCalledWith(
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

    expect(receiverService.handleMessage).not.toHaveBeenCalled();
    expect(receiverService.handleCallbackQuery).not.toHaveBeenCalled();
  });
});

function createRequest(isAuthenticated: boolean): ReceiverWebhookRequest {
  return {
    telegramWebhook: isAuthenticated
      ? { isAuthenticated: true }
      : { isAuthenticated: false, reason: 'Invalid secret token' },
  } as ReceiverWebhookRequest;
}
