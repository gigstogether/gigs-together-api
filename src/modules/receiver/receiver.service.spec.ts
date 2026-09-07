import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ReceiverService } from './receiver.service';
import { TelegramService } from '../telegram/telegram.service';
import { GigService } from '../gig/gig.service';
import type { TGMessage } from '../telegram/types/message.types';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import {
  CallbackScope,
  encodeCallbackData,
  GigCandidateCallbackAction,
  GigCallbackAction,
} from '../telegram/callback-action';
import { GigModerationService } from '../gig/gig-moderation.service';
import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';

describe('ReceiverService', () => {
  let service: ReceiverService;

  const mockTelegramService = {
    sendMessage: vi.fn(),
    answerCallbackQuery: vi.fn(),
    editMessageReplyMarkup: vi.fn(),
    editMainPost: vi.fn(),
    buildGigStatusReplyMarkup: vi.fn(),
    pickTgPost: vi.fn(),
    sendToModeration: vi.fn(),
    updateGigModerationPost: vi.fn(),
  };

  const mockGigService = {
    saveGig: vi.fn(),
    updateGig: vi.fn(),
    updateGigByPublicId: vi.fn(),
    updateTelegramPostFileId: vi.fn(),
    updateGigStatus: vi.fn(),
  };

  const mockGigModerationService = {
    createGigMainPost: vi.fn(),
  };

  const mockGigCandidateService = {
    approveGigCandidate: vi.fn(),
    sendGigCandidateToModeration: vi.fn(),
    rejectGigCandidate: vi.fn(),
  };

  beforeEach(async () => {
    vi.unstubAllEnvs();

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
        {
          provide: GigCandidateService,
          useValue: mockGigCandidateService,
        },
      ],
    }).compile();

    service = module.get<ReceiverService>(ReceiverService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mockTelegramService.pickTgPost.mockImplementation((posts, type) =>
      posts?.find((post) => {
        return (
          post.to === Messenger.Telegram &&
          post.type === type &&
          post.chatId != null &&
          post.id != null
        );
      }),
    );
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

  describe('handleCallbackQuery', () => {
    it('should create a main Telegram post when the Post callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-1',
        data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: GigCallbackAction.Post,
          id: '507f1f77bcf86cd799439011',
          expectedVersion: 6,
        }),
        from: {
          id: 1,
          is_bot: false,
          first_name: 'Arina',
        },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100123, type: 'channel' },
        },
      };

      mockGigModerationService.createGigMainPost.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(
        callbackQuery,
        '507f1f77bcf86cd799439088',
      );

      expect(mockGigModerationService.createGigMainPost).toHaveBeenCalledWith({
        gigId: '507f1f77bcf86cd799439011',
        expectedVersion: 6,
        moderationPost: {
          messageId: 42,
          chatId: -100123,
        },
      });
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: 'callback-1',
        text: 'Done!',
        show_alert: false,
      });
    });

    it('should answer with an error when legacy flat callback_data is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-legacy',
        data: 'approve:507f1f77bcf86cd799439011',
        from: {
          id: 1,
          is_bot: false,
          first_name: 'Arina',
        },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100123, type: 'channel' },
        },
      };

      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(
        callbackQuery,
        '507f1f77bcf86cd799439088',
      );

      expect(mockGigModerationService.createGigMainPost).not.toHaveBeenCalled();
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: 'callback-legacy',
        text: 'Something unexpected happened, I dunno what to do',
        show_alert: true,
      });
    });

    it('should send GigCandidate to moderation with callback expected version', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-gigCandidate-send',
        data: encodeCallbackData({
          scope: CallbackScope.GigCandidate,
          action: GigCandidateCallbackAction.SendToModeration,
          id: '507f1f77bcf86cd799439099',
          expectedVersion: 3,
        }),
        from: { id: 1, is_bot: false, first_name: 'Arina' },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100123, type: 'channel' },
        },
      };

      await service.handleCallbackQuery(
        callbackQuery,
        '507f1f77bcf86cd799439088',
      );

      expect(
        mockGigCandidateService.sendGigCandidateToModeration,
      ).toHaveBeenCalledWith({
        gigCandidateId: '507f1f77bcf86cd799439099',
        expectedVersion: 3,
      });
    });

    it('should reject GigCandidate with internal admin user id', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-gigCandidate-reject',
        data: encodeCallbackData({
          scope: CallbackScope.GigCandidate,
          action: GigCandidateCallbackAction.Reject,
          id: '507f1f77bcf86cd799439099',
          expectedVersion: 4,
        }),
        from: { id: 1, is_bot: false, first_name: 'Arina' },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100123, type: 'channel' },
        },
      };

      await service.handleCallbackQuery(
        callbackQuery,
        '507f1f77bcf86cd799439088',
      );

      expect(mockGigCandidateService.rejectGigCandidate).toHaveBeenCalledWith({
        gigCandidateId: '507f1f77bcf86cd799439099',
        expectedVersion: 4,
        rejectedByUserId: '507f1f77bcf86cd799439088',
      });
    });

    it('should approve GigCandidate with expected version and internal admin user ID', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-gigCandidate-approve',
        data: encodeCallbackData({
          scope: CallbackScope.GigCandidate,
          action: GigCandidateCallbackAction.Approve,
          id: '507f1f77bcf86cd799439099',
          expectedVersion: 4,
        }),
        from: { id: 1, is_bot: false, first_name: 'Arina' },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100123, type: 'channel' },
        },
      };

      await service.handleCallbackQuery(
        callbackQuery,
        '507f1f77bcf86cd799439088',
      );

      expect(mockGigCandidateService.approveGigCandidate).toHaveBeenCalledWith({
        gigCandidateId: '507f1f77bcf86cd799439099',
        expectedVersion: 4,
        approvedByUserId: '507f1f77bcf86cd799439088',
      });
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: 'callback-gigCandidate-approve',
        text: 'Done!',
        show_alert: false,
      });
    });
  });
});
