import { Logger } from '@nestjs/common';
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
import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigCandidateApprovalValidationError } from '../gig-candidate/gig-candidate-approval';
import { UserService } from '../user/user.service';
import { AuthorizationService } from '../auth/authorization.service';

describe('ReceiverService', () => {
  let service: ReceiverService;

  const mockTelegramService = {
    sendMessage: vi.fn(),
    sendIncomingMessageUnavailable: vi.fn(),
    sendStartCommandResponse: vi.fn(),
    sendUnknownCommandResponse: vi.fn(),
    answerCallbackQuery: vi.fn(),
    editMessageReplyMarkup: vi.fn(),
    editGigPost: vi.fn(),
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
    createGigMainPost: vi.fn(),
    setGigVisibility: vi.fn(),
  };

  const mockGigCandidateService = {
    approveGigCandidate: vi.fn(),
    sendGigCandidateToModeration: vi.fn(),
    rejectGigCandidate: vi.fn(),
  };

  const mockUserService = {
    findOrCreateMessengerUser: vi.fn(),
  };

  const mockAuthorizationService = {
    isAdmin: vi.fn(),
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
          provide: GigCandidateService,
          useValue: mockGigCandidateService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: AuthorizationService,
          useValue: mockAuthorizationService,
        },
      ],
    }).compile();

    service = module.get<ReceiverService>(ReceiverService);
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
      };

      mockTelegramService.sendIncomingMessageUnavailable.mockResolvedValue(
        undefined,
      );

      await service.handleMessage(message);

      expect(
        mockTelegramService.sendIncomingMessageUnavailable,
      ).toHaveBeenCalledWith({ id: 12345, type: 'private' });
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

      mockTelegramService.sendStartCommandResponse.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(mockTelegramService.sendStartCommandResponse).toHaveBeenCalledWith(
        { id: 12345, type: 'private' },
      );
      expect(mockUserService.findOrCreateMessengerUser).not.toHaveBeenCalled();
    });

    it('should handle an unknown command', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: '/unknown',
        chat: { id: 12345, type: 'private' },
      };

      mockTelegramService.sendUnknownCommandResponse.mockResolvedValue(
        undefined,
      );

      await service.handleMessage(message);

      expect(
        mockTelegramService.sendUnknownCommandResponse,
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
      mockGigCandidateService.approveGigCandidate.mockRejectedValue({
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
      mockGigCandidateService.approveGigCandidate.mockRejectedValue(
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
