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
import { PostType } from '../../shared/types/post-type.enum';
import { Status } from '../gig/types/status.enum';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';

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

  const mockGigCandidateService = {
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
          userId: '66a000000000000000000012345',
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
          userId: '66a000000000000000000012345',
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
          userId: '66a000000000000000000012345',
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
          userId: '66a000000000000000000012345',
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
        data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: GigCallbackAction.Post,
          id: '507f1f77bcf86cd799439011',
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

      mockGigModerationService.publishGigPost.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(
        callbackQuery,
        '507f1f77bcf86cd799439088',
      );

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

    it('should reject Gig when reject callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-reject-gig',
        data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: GigCallbackAction.Reject,
          id: '507f1f77bcf86cd799439011',
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

      mockGigModerationService.rejectGig.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(
        callbackQuery,
        '507f1f77bcf86cd799439088',
      );

      expect(mockGigModerationService.rejectGig).toHaveBeenCalledWith({
        gigId: '507f1f77bcf86cd799439011',
        moderationPost: {
          messageId: 42,
          chatId: -100123,
        },
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

      expect(mockGigModerationService.approveGig).not.toHaveBeenCalled();
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

    it('should keep GigCandidate Approve callback inactive before Stage 10', async () => {
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

      expect(mockGigCandidateService.rejectGigCandidate).not.toHaveBeenCalled();
      expect(
        mockGigCandidateService.sendGigCandidateToModeration,
      ).not.toHaveBeenCalled();
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: 'callback-gigCandidate-approve',
        text: 'Gig Candidate approval is not available yet',
        show_alert: true,
      });
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
