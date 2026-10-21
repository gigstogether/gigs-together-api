import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TelegramUpdatesService } from './telegram-updates.service';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramBotReplyService } from '../telegram/telegram-bot-reply/telegram-bot-reply.service';
import { GigService } from '../gig/gig.service';
import type { TGMessage } from '../telegram/types/message.types';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import {
  CallbackScope,
  encodeCallbackData,
  GigCandidateCallbackAction,
  GigCallbackAction,
} from '../telegram/utils/telegram-callback-action';
import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigCandidateApprovalValidationError } from '../gig-candidate/gig-candidate-approval/gig-candidate-approval';
import { GigCandidateApprovalService } from '../gig-candidate/gig-candidate-approval/gig-candidate-approval.service';
import { UserService } from '../user/user.service';
import { AuthorizationService } from '../auth/authorization.service';

describe('TelegramUpdatesService', () => {
  let service: TelegramUpdatesService;

  const mockTelegramService = {
    getBotUsername: vi.fn(),
    sendMessage: vi.fn(),
    setMessageReaction: vi.fn(),
    answerCallbackQuery: vi.fn(),
    editMessageReplyMarkup: vi.fn(),
    editGigPost: vi.fn(),
    buildGigStatusReplyMarkup: vi.fn(),
    pickTgPost: vi.fn(),
    sendToModeration: vi.fn(),
    updateGigModerationPost: vi.fn(),
  };

  const mockTelegramBotReplyService = {
    sendIncomingMessageUnavailable: vi.fn(),
    sendStartCommandResponse: vi.fn(),
    sendUnknownCommandResponse: vi.fn(),
  };

  const mockGigService = {
    saveGig: vi.fn(),
    updateGig: vi.fn(),
    updateGigByPublicId: vi.fn(),
    updateTelegramPostFileId: vi.fn(),
    updateGigStatus: vi.fn(),
    createGigMainPost: vi.fn(),
    setGigVisibility: vi.fn(),
  };

  const mockGigCandidateService = {
    submitMessengerGigCandidate: vi.fn(),
    sendGigCandidateToModeration: vi.fn(),
    rejectGigCandidate: vi.fn(),
  };

  const mockGigCandidateApprovalService = {
    approveGigCandidate: vi.fn(),
  };

  const mockUserService = {
    findOrCreateMessengerUser: vi.fn(),
  };

  const mockAuthorizationService = {
    isAdmin: vi.fn(),
  };

  async function createService(
    mainChatId: string,
  ): Promise<TelegramUpdatesService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramUpdatesService,
        {
          provide: TelegramService,
          useValue: mockTelegramService,
        },
        {
          provide: TelegramBotReplyService,
          useValue: mockTelegramBotReplyService,
        },
        {
          provide: GigService,
          useValue: mockGigService,
        },
        {
          provide: GigCandidateService,
          useValue: mockGigCandidateService,
        },
        {
          provide: GigCandidateApprovalService,
          useValue: mockGigCandidateApprovalService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: AuthorizationService,
          useValue: mockAuthorizationService,
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ MAIN_CHAT_ID: mainChatId }),
        },
      ],
    }).compile();

    return module.get<TelegramUpdatesService>(TelegramUpdatesService);
  }

  beforeEach(async () => {
    vi.unstubAllEnvs();

    service = await createService('-100123');
    mockTelegramService.getBotUsername.mockReturnValue('gigstogetherbot');
    mockUserService.findOrCreateMessengerUser.mockResolvedValue({
      id: '507f1f77bcf86cd799439088',
    });
    mockAuthorizationService.isAdmin.mockResolvedValue(true);
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
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Arina',
        },
      };

      mockTelegramBotReplyService.sendIncomingMessageUnavailable.mockResolvedValue(
        undefined,
      );

      await service.handleMessage(message);

      expect(
        mockTelegramBotReplyService.sendIncomingMessageUnavailable,
      ).toHaveBeenCalledWith({ id: 12345, type: 'private' });
    });

    it('should respond to a photo sent by a user', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Arina',
        },
        photo: [
          {
            file_id: 'photo-file-id',
            file_unique_id: 'photo-file-unique-id',
            width: 320,
            height: 240,
          },
        ],
      };

      mockTelegramBotReplyService.sendIncomingMessageUnavailable.mockResolvedValue(
        undefined,
      );

      await service.handleMessage(message);

      expect(
        mockTelegramBotReplyService.sendIncomingMessageUnavailable,
      ).toHaveBeenCalledWith({ id: 12345, type: 'private' });
    });

    it('should ignore a write access service message', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Arina',
        },
        write_access_allowed: {
          web_app_name: 'Gigs Together',
        },
      };

      await service.handleMessage(message);

      expect(
        mockTelegramBotReplyService.sendIncomingMessageUnavailable,
      ).not.toHaveBeenCalled();
    });

    it('should ignore a connected website service message', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Arina',
        },
        connected_website: 'dev.gigstogether.com',
      };

      await service.handleMessage(message);

      expect(
        mockTelegramBotReplyService.sendIncomingMessageUnavailable,
      ).not.toHaveBeenCalled();
    });

    it('should ignore a message sent by a bot', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: 'Hello!',
        chat: { id: 12345, type: 'private' },
        from: {
          id: 42,
          is_bot: true,
          first_name: 'Another bot',
        },
      };

      await service.handleMessage(message);

      expect(
        mockTelegramBotReplyService.sendIncomingMessageUnavailable,
      ).not.toHaveBeenCalled();
    });

    it('should handle the /start command without creating a User', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: '/start',
        chat: { id: 12345, type: 'private' },
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Arina',
          last_name: 'Goodboy',
          username: 'arina',
        },
      };

      mockTelegramBotReplyService.sendStartCommandResponse.mockResolvedValue(
        undefined,
      );

      await service.handleMessage(message);

      expect(
        mockTelegramBotReplyService.sendStartCommandResponse,
      ).toHaveBeenCalledWith({ id: 12345, type: 'private' });
      expect(mockUserService.findOrCreateMessengerUser).not.toHaveBeenCalled();
    });

    it('should create a candidate and react to a suggestion from the configured group', async () => {
      const message: TGMessage = {
        message_id: 42,
        date: Date.now(),
        text: '/suggest Radiohead in Barcelona',
        chat: { id: -100123, type: 'supergroup' },
        from: {
          id: 7,
          is_bot: false,
          first_name: 'Arina',
        },
      };
      mockGigCandidateService.submitMessengerGigCandidate.mockResolvedValue(
        undefined,
      );
      mockTelegramService.setMessageReaction.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(
        mockGigCandidateService.submitMessengerGigCandidate,
      ).toHaveBeenCalledWith({
        messenger: Messenger.Telegram,
        chatId: -100123,
        messageId: 42,
        originalText: 'Radiohead in Barcelona',
      });
      expect(mockTelegramService.setMessageReaction).toHaveBeenCalledWith({
        chat_id: -100123,
        message_id: 42,
        reaction: [{ type: 'emoji', emoji: '👍' }],
      });
      expect(mockUserService.findOrCreateMessengerUser).not.toHaveBeenCalled();
    });

    it('should preserve suggestion text when the group command mentions the bot', async () => {
      const message: TGMessage = {
        message_id: 43,
        date: Date.now(),
        text: '/SuGgEsT@GigsTogetherBot   Band Name\n12 June',
        chat: { id: -100123, type: 'group' },
        from: {
          id: 7,
          is_bot: false,
          first_name: 'Arina',
        },
      };
      mockGigCandidateService.submitMessengerGigCandidate.mockResolvedValue(
        undefined,
      );
      mockTelegramService.setMessageReaction.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(
        mockGigCandidateService.submitMessengerGigCandidate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ originalText: 'Band Name\n12 June' }),
      );
    });

    it('should create a candidate from the message replied to with a suggest command', async () => {
      const message: TGMessage = {
        message_id: 44,
        date: Date.now(),
        text: '/suggest@GigsTogetherBot',
        chat: { id: -100123, type: 'supergroup' },
        from: { id: 7, is_bot: false, first_name: 'Arina' },
        reply_to_message: {
          message_id: 41,
          date: Date.now(),
          text: '  Radiohead in Barcelona\n12 June  ',
          chat: { id: -100123, type: 'supergroup' },
          from: { id: 8, is_bot: false, first_name: 'Another user' },
        },
      };
      mockGigCandidateService.submitMessengerGigCandidate.mockResolvedValue(
        undefined,
      );
      mockTelegramService.setMessageReaction.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(
        mockGigCandidateService.submitMessengerGigCandidate,
      ).toHaveBeenCalledWith({
        messenger: Messenger.Telegram,
        chatId: -100123,
        messageId: 41,
        originalText: 'Radiohead in Barcelona\n12 June',
      });
      expect(mockTelegramService.setMessageReaction).toHaveBeenCalledWith({
        chat_id: -100123,
        message_id: 44,
        reaction: [{ type: 'emoji', emoji: '👍' }],
      });
    });

    it('should ignore a command addressed to another bot', async () => {
      const message: TGMessage = {
        message_id: 44,
        date: Date.now(),
        text: '/suggest@AnotherBot Radiohead in Barcelona',
        chat: { id: -100123, type: 'supergroup' },
        from: {
          id: 7,
          is_bot: false,
          first_name: 'Arina',
        },
      };

      await service.handleMessage(message);

      expect(
        mockGigCandidateService.submitMessengerGigCandidate,
      ).not.toHaveBeenCalled();
      expect(mockTelegramService.setMessageReaction).not.toHaveBeenCalled();
      expect(
        mockTelegramBotReplyService.sendUnknownCommandResponse,
      ).not.toHaveBeenCalled();
    });

    it('should log the error and keep the webhook successful when the suggestion cannot be saved', async () => {
      const message: TGMessage = {
        message_id: 49,
        date: Date.now(),
        text: '/suggest Radiohead in Barcelona',
        chat: { id: -100123, type: 'supergroup' },
        from: { id: 7, is_bot: false, first_name: 'Arina' },
      };
      mockGigCandidateService.submitMessengerGigCandidate.mockRejectedValueOnce(
        new Error('Database unavailable'),
      );
      const loggerSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(service.handleMessage(message)).resolves.toBeUndefined();

      expect(mockTelegramService.setMessageReaction).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database unavailable'),
      );
    });

    it('should keep the suggestion accepted when Telegram rejects the acknowledgement reaction', async () => {
      const message: TGMessage = {
        message_id: 50,
        date: Date.now(),
        text: '/suggest Radiohead in Barcelona',
        chat: { id: -100123, type: 'supergroup' },
        from: { id: 7, is_bot: false, first_name: 'Arina' },
      };
      const loggerSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockGigCandidateService.submitMessengerGigCandidate.mockResolvedValue(
        undefined,
      );
      mockTelegramService.setMessageReaction.mockRejectedValue({
        response: {
          data: {
            error_code: 400,
            description: 'Bad Request: REACTION_INVALID',
          },
        },
      });

      await expect(service.handleMessage(message)).resolves.toBeUndefined();

      expect(
        mockGigCandidateService.submitMessengerGigCandidate,
      ).toHaveBeenCalledOnce();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Setting Telegram suggestion acknowledgement reaction failed for chatId=-100123 messageId=50',
        ),
      );
    });

    it('should ignore suggestions outside the configured group', async () => {
      const messages: TGMessage[] = [
        {
          message_id: 44,
          date: Date.now(),
          text: '/suggest Wrong group',
          chat: { id: -100456, type: 'supergroup' },
          from: { id: 7, is_bot: false, first_name: 'Arina' },
        },
        {
          message_id: 45,
          date: Date.now(),
          text: '/suggest Private chat',
          chat: { id: -100123, type: 'private' },
          from: { id: 7, is_bot: false, first_name: 'Arina' },
        },
      ];

      for (const message of messages) {
        await service.handleMessage(message);
      }

      expect(
        mockGigCandidateService.submitMessengerGigCandidate,
      ).not.toHaveBeenCalled();
      expect(mockTelegramService.setMessageReaction).not.toHaveBeenCalled();
    });

    it('should ignore an empty suggestion and ordinary group messages', async () => {
      const messages: TGMessage[] = [
        {
          message_id: 46,
          date: Date.now(),
          text: '/suggest   ',
          chat: { id: -100123, type: 'supergroup' },
          from: { id: 7, is_bot: false, first_name: 'Arina' },
        },
        {
          message_id: 47,
          date: Date.now(),
          text: 'Radiohead in Barcelona',
          chat: { id: -100123, type: 'supergroup' },
          from: { id: 7, is_bot: false, first_name: 'Arina' },
        },
        {
          message_id: 48,
          date: Date.now(),
          text: '/suggest@GigsTogetherBot',
          chat: { id: -100123, type: 'supergroup' },
          from: { id: 7, is_bot: false, first_name: 'Arina' },
          reply_to_message: {
            message_id: 45,
            date: Date.now(),
            chat: { id: -100123, type: 'supergroup' },
            from: { id: 8, is_bot: false, first_name: 'Another user' },
            photo: [],
          },
        },
      ];

      for (const message of messages) {
        await service.handleMessage(message);
      }

      expect(
        mockGigCandidateService.submitMessengerGigCandidate,
      ).not.toHaveBeenCalled();
      expect(mockTelegramService.setMessageReaction).not.toHaveBeenCalled();
      expect(
        mockTelegramBotReplyService.sendIncomingMessageUnavailable,
      ).not.toHaveBeenCalled();
    });

    it('should reject construction when suggestions chat ID is invalid', async () => {
      await expect(createService('invalid')).rejects.toThrowError(
        'MAIN_CHAT_ID must be a non-zero safe integer.',
      );
    });

    it('should reject construction when suggestions chat ID is empty', async () => {
      await expect(createService('   ')).rejects.toThrowError(
        'MAIN_CHAT_ID is not configured.',
      );
    });

    it('should handle an unknown command', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: '/unknown',
        chat: { id: 12345, type: 'private' },
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Arina',
        },
      };

      mockTelegramBotReplyService.sendUnknownCommandResponse.mockResolvedValue(
        undefined,
      );

      await service.handleMessage(message);

      expect(
        mockTelegramBotReplyService.sendUnknownCommandResponse,
      ).toHaveBeenCalledWith({ id: 12345, type: 'private' });
    });

    it('should ignore empty messages', async () => {
      await service.handleMessage(undefined as unknown as TGMessage);
      await service.handleMessage({} as TGMessage);

      expect(mockTelegramService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleCallbackQuery', () => {
    it('should create the main Telegram post when the Post callback is received', async () => {
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

      mockGigService.createGigMainPost.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigService.createGigMainPost).toHaveBeenCalledWith({
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

    it('should hide the Gig when Hide callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-hide',
        data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: GigCallbackAction.Hide,
          id: '507f1f77bcf86cd799439011',
          expectedVersion: 7,
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
      mockGigService.setGigVisibility.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigService.setGigVisibility).toHaveBeenCalledWith({
        gigId: '507f1f77bcf86cd799439011',
        expectedVersion: 7,
        isVisible: false,
        moderationPost: {
          messageId: 42,
          chatId: -100123,
        },
      });
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: 'callback-hide',
        text: 'Done!',
        show_alert: false,
      });
    });

    it('should show the Gig when Show callback is received', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-show',
        data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: GigCallbackAction.Show,
          id: '507f1f77bcf86cd799439011',
          expectedVersion: 8,
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
      mockGigService.setGigVisibility.mockResolvedValue(undefined);
      mockTelegramService.answerCallbackQuery.mockResolvedValue(undefined);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigService.setGigVisibility).toHaveBeenCalledWith({
        gigId: '507f1f77bcf86cd799439011',
        expectedVersion: 8,
        isVisible: true,
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

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigService.createGigMainPost).not.toHaveBeenCalled();
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

      await service.handleCallbackQuery(callbackQuery);

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

      await service.handleCallbackQuery(callbackQuery);

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

      await service.handleCallbackQuery(callbackQuery);

      expect(
        mockGigCandidateApprovalService.approveGigCandidate,
      ).toHaveBeenCalledWith({
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

    it('should log safe Telegram details when callback processing fails', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-gigCandidate-approve-error',
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
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockGigCandidateApprovalService.approveGigCandidate.mockRejectedValue({
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            ok: false,
            error_code: 400,
            description: 'Bad Request: message is not modified',
          },
        },
      });

      await service.handleCallbackQuery(callbackQuery);

      expect(warnSpy).toHaveBeenCalledWith(
        'handleCallbackQuery failed: Request failed with status code 400; httpStatus=400; telegramErrorCode=400; telegramDescription=Bad Request: message is not modified',
      );
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: callbackQuery.id,
        text: 'Failed: Bad Request: message is not modified',
        show_alert: true,
      });
    });

    it('should answer without warning when GigCandidate approval validation fails', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-gigCandidate-invalid-draft',
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
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockGigCandidateApprovalService.approveGigCandidate.mockRejectedValue(
        new GigCandidateApprovalValidationError([
          { field: 'venue', code: 'required', message: 'venue is required' },
        ]),
      );

      await service.handleCallbackQuery(callbackQuery);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: 'callback-gigCandidate-invalid-draft',
        text: 'Failed: GigCandidate gigDraft is incomplete or invalid.',
        show_alert: true,
      });
    });

    it('should reject a callback from a non-admin user', async () => {
      const callbackQuery: TGCallbackQuery = {
        id: 'callback-non-admin',
        data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: GigCallbackAction.Hide,
          id: '507f1f77bcf86cd799439011',
          expectedVersion: 7,
        }),
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Arina',
        },
        message: {
          message_id: 42,
          date: Date.now(),
          chat: { id: -100123, type: 'channel' },
        },
      };
      mockAuthorizationService.isAdmin.mockResolvedValue(false);

      await service.handleCallbackQuery(callbackQuery);

      expect(mockGigService.setGigVisibility).not.toHaveBeenCalled();
      expect(mockTelegramService.answerCallbackQuery).toHaveBeenCalledWith({
        callback_query_id: 'callback-non-admin',
        text: 'Admin privileges required',
        show_alert: true,
      });
    });
  });
});
