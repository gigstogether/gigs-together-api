import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ReceiverService } from './receiver.service';
import { TelegramService } from '../telegram/telegram.service';
import { GigService } from '../gig/gig.service';
import type { TGMessage } from '../telegram/types/message.types';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import { Action } from '../telegram/types/action.enum';
import { GigModerationService } from '../gig/gig-moderation.service';
import { GigCandidateModerationService } from '../gig-candidate/gig-candidate-moderation.service';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { Status } from '../gig/types/status.enum';

describe('ReceiverService', () => {
  let service: ReceiverService;

  const mockTelegramService = {
    sendMessage: vi.fn(),
    answerCallbackQuery: vi.fn(),
    editMessageReplyMarkup: vi.fn(),
    editMainPost: vi.fn(),
    publishDraft: vi.fn(),
    publishMain: vi.fn(),
    publishToChat: vi.fn(),
    buildGigStatusReplyMarkup: vi.fn(),
    pickTgPost: vi.fn(),
    sendToModeration: vi.fn(),
    sendSubmissionFeedback: vi.fn(),
    updateModerationPostAfterGigPublished: vi.fn(),
  };

  const mockGigService = {
    saveGig: vi.fn(),
    updateGig: vi.fn(),
    updateGigByPublicId: vi.fn(),
    updateTelegramPostFileId: vi.fn(),
    updateGigStatus: vi.fn(),
  };

  const mockGigModerationService = {
    approveGig: vi.fn(),
    publishGigPost: vi.fn(),
    rejectGig: vi.fn(),
  };

  const mockGigCandidateModerationService = {
    accept: vi.fn(),
    reject: vi.fn(),
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
          provide: GigCandidateModerationService,
          useValue: mockGigCandidateModerationService,
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

  describe('handleGigSubmit', () => {
    it('should return publicId when gig is saved', async () => {
      mockGigService.saveGig.mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439011',
        publicId: 'arctic-monkeys-2026-07-01',
      });
      mockTelegramService.sendToModeration.mockResolvedValueOnce(undefined);
      mockGigService.updateGig.mockResolvedValueOnce(undefined);
      mockTelegramService.sendSubmissionFeedback.mockClear();

      const result = await service.handleGigSubmit(
        {
          gig: {
            title: 'Arctic Monkeys',
            date: '2026-07-01',
            city: 'Barcelona',
            country: 'ES',
            venue: 'Razzmatazz',
            ticketsUrl: 'https://tickets.example/gig',
          },
        },
        {
          tgUser: {
            id: 12345,
            username: 'admin',
            first_name: 'Admin',
            last_name: 'User',
          },
          isAdmin: false,
        },
        undefined,
      );

      expect(result).toEqual({ publicId: 'arctic-monkeys-2026-07-01' });
    });

    it('should send submission feedback when user is not admin and env flag is disabled by default', async () => {
      const savedGig = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'arctic-monkeys-2026-07-01',
      };
      mockGigService.saveGig.mockResolvedValueOnce(savedGig);
      mockTelegramService.sendToModeration.mockResolvedValueOnce(undefined);
      mockGigService.updateGig.mockResolvedValueOnce(undefined);
      mockTelegramService.sendSubmissionFeedback.mockResolvedValueOnce({
        message_id: 777,
      });

      await service.handleGigSubmit(
        {
          gig: {
            title: 'Arctic Monkeys',
            date: '2026-07-01',
            city: 'Barcelona',
            country: 'ES',
            venue: 'Razzmatazz',
            ticketsUrl: 'https://tickets.example/gig',
          },
        },
        {
          tgUser: {
            id: 12345,
            username: 'user',
            first_name: 'Regular',
            last_name: 'User',
          },
          isAdmin: false,
        },
        undefined,
      );

      expect(mockTelegramService.sendSubmissionFeedback).toHaveBeenCalledWith(
        savedGig,
        12345,
      );
    });

    it('should skip submission feedback when user is admin and admin feedback env flag is disabled by default', async () => {
      mockGigService.saveGig.mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439011',
        publicId: 'arctic-monkeys-2026-07-01',
      });
      mockTelegramService.sendToModeration.mockResolvedValueOnce(undefined);
      mockGigService.updateGig.mockResolvedValueOnce(undefined);

      await service.handleGigSubmit(
        {
          gig: {
            title: 'Arctic Monkeys',
            date: '2026-07-01',
            city: 'Barcelona',
            country: 'ES',
            venue: 'Razzmatazz',
            ticketsUrl: 'https://tickets.example/gig',
          },
        },
        {
          tgUser: {
            id: 12345,
            username: 'admin',
            first_name: 'Admin',
            last_name: 'User',
          },
          isAdmin: true,
        },
        undefined,
      );

      expect(mockTelegramService.sendSubmissionFeedback).not.toHaveBeenCalled();
    });

    it('should send submission feedback when user is admin and SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS is true', async () => {
      vi.stubEnv('SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS', 'true');

      const savedGig = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'arctic-monkeys-2026-07-01',
      };
      mockGigService.saveGig.mockResolvedValueOnce(savedGig);
      mockTelegramService.sendToModeration.mockResolvedValueOnce(undefined);
      mockGigService.updateGig.mockResolvedValueOnce(undefined);
      mockTelegramService.sendSubmissionFeedback.mockResolvedValueOnce({
        message_id: 778,
      });

      await service.handleGigSubmit(
        {
          gig: {
            title: 'Arctic Monkeys',
            date: '2026-07-01',
            city: 'Barcelona',
            country: 'ES',
            venue: 'Razzmatazz',
            ticketsUrl: 'https://tickets.example/gig',
          },
        },
        {
          tgUser: {
            id: 12345,
            username: 'admin',
            first_name: 'Admin',
            last_name: 'User',
          },
          isAdmin: true,
        },
        undefined,
      );

      expect(mockTelegramService.sendSubmissionFeedback).toHaveBeenCalledWith(
        savedGig,
        12345,
      );
    });
  });

  describe('handleCallbackQuery', () => {
    it('should publish main Telegram post when publish callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-1',
        data: `${Action.Post}:507f1f77bcf86cd799439011`,
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

      mockGigModerationService.publishGigPost.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigModerationService.publishGigPost).toHaveBeenCalledWith({
        gigId: '507f1f77bcf86cd799439011',
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

    it('should accept GigCandidate when accept callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-accept',
        data: `${Action.AcceptCandidate}:507f1f77bcf86cd799439011`,
        from: {
          id: 1,
          is_bot: false,
          first_name: 'Arina',
        },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100999, type: 'channel' },
        },
      };

      mockGigCandidateModerationService.accept.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigCandidateModerationService.accept).toHaveBeenCalledWith({
        gigCandidateId: '507f1f77bcf86cd799439011',
        suggestionPost: {
          messageId: 42,
          chatId: -100999,
        },
      });
    });

    it('should reject GigCandidate when rejectCandidate callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-reject-candidate',
        data: `${Action.RejectCandidate}:507f1f77bcf86cd799439011`,
        from: {
          id: 1,
          is_bot: false,
          first_name: 'Arina',
        },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100999, type: 'channel' },
        },
      };

      mockGigCandidateModerationService.reject.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigCandidateModerationService.reject).toHaveBeenCalledWith({
        gigCandidateId: '507f1f77bcf86cd799439011',
        suggestionPost: {
          messageId: 42,
          chatId: -100999,
        },
      });
      expect(mockGigModerationService.rejectGig).not.toHaveBeenCalled();
    });

    it('should reject Gig when reject callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-reject-gig',
        data: `${Action.Reject}:507f1f77bcf86cd799439011`,
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

      mockGigModerationService.rejectGig.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigModerationService.rejectGig).toHaveBeenCalledWith({
        gigId: '507f1f77bcf86cd799439011',
        moderationPost: {
          messageId: 42,
          chatId: -100123,
        },
      });
      expect(mockGigCandidateModerationService.reject).not.toHaveBeenCalled();
    });
  });

  describe('updateGigByPublicId', () => {
    it('should edit main post for published gig before updating publish fileId', async () => {
      const updatedGig = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'radiohead-barcelona-2026-06-12',
        title: 'Radiohead',
        date: '2026-06-12',
        city: 'barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        status: Status.Published,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: -100123,
            id: 42,
            date: 1_780_000_000_000,
          },
        ],
      };

      mockGigService.updateGigByPublicId.mockResolvedValue(updatedGig);
      mockTelegramService.editMainPost.mockResolvedValue(undefined);

      await service.updateGigByPublicId({
        publicId: 'radiohead-barcelona-2026-06-12',
        body: {
          gig: {
            title: 'Radiohead',
            date: '2026-06-12',
            city: 'Barcelona',
            country: 'ES',
            venue: 'Palau Sant Jordi',
            ticketsUrl: 'https://tickets.example/radiohead',
          },
        },
        posterFile: undefined,
      });

      expect(mockTelegramService.editMainPost).toHaveBeenCalledWith(
        updatedGig,
        {
          updateMedia: false,
        },
      );
    });
  });
});
