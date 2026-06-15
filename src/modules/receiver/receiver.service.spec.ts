import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ReceiverService } from './receiver.service';
import { TelegramService } from '../telegram/telegram.service';
import { GigService } from '../gig/gig.service';
import type { TGMessage } from '../telegram/types/message.types';
import { GigModerationService } from '../gig/gig-moderation.service';

describe('ReceiverService', () => {
  let service: ReceiverService;

  const mockTelegramService = {
    sendMessage: vi.fn(),
    answerCallbackQuery: vi.fn(),
    editMessageReplyMarkup: vi.fn(),
    publishDraft: vi.fn(),
    publishMain: vi.fn(),
    publishToChat: vi.fn(),
    buildGigStatusReplyMarkup: vi.fn(),
  };

  const mockGigService = {
    saveGig: vi.fn(),
    updateGig: vi.fn(),
    updateGigStatus: vi.fn(),
  };

  const mockGigModerationService = {
    approveGig: vi.fn(),
    rejectGig: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiverService,
        {
          provide: TelegramService,
          useValue: mockTelegramService,
        },
        {
          provide: GigService,
          useValue: mockGigService,
        },
        {
          provide: GigModerationService,
          useValue: mockGigModerationService,
        },
      ],
    }).compile();

    service = module.get<ReceiverService>(ReceiverService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleMessage', () => {
    it('should respond to a non-command message', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: 'Hello!',
        chat: { id: 12345, type: 'private' },
      };

      mockTelegramService.sendMessage.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 12345,
          text: expect.stringContaining("the bot can't receive messages"),
        }),
      );
    });

    it('should handle the /start command', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: '/start',
        chat: { id: 12345, type: 'private' },
      };

      mockTelegramService.sendMessage.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith({
        chat_id: 12345,
        text: `Hi! I'm a Gigs Together bot. I am still in development...`,
      });
    });

    it('should handle an unknown command', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: '/unknown',
        chat: { id: 12345, type: 'private' },
      };

      mockTelegramService.sendMessage.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith({
        chat_id: 12345,
        text: `Hey there, I don't know that command.`,
      });
    });

    it('should ignore empty messages', async () => {
      await service.handleMessage(undefined as unknown as TGMessage);
      await service.handleMessage({} as TGMessage);

      expect(mockTelegramService.sendMessage).not.toHaveBeenCalled();
    });
  });
});
