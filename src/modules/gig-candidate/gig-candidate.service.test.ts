import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GigPosterService } from '../gig/gig-poster/gig-poster.service';
import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../gig/types/gig-source-user-origin-type.enum';
import { PostType } from '@shared/types/post-type.enum';
import { TelegramGigCandidateService } from '../telegram/telegram-gig-candidate/telegram-gig-candidate.service';
import { TelegramGigService } from '../telegram/telegram-gig/telegram-gig.service';
import { Messenger } from '@shared/types/messenger.enum';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { GigFeedRevalidationService } from '../gig/gig-feed/gig-feed-revalidation.service';
import { GigService } from '../gig/gig.service';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from './gig-candidate-approval/repositories/gig-candidate-approval.repository';
import {
  GigCandidateCommand,
  GigCandidateConflictError,
} from './gig-candidate-state-machine';
import { GigCandidateService } from './gig-candidate.service';
import type { MessengerGigCandidateImage } from './gig-candidate.service';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type { GigCandidate } from './types/gig-candidate.types';
import { GigCandidateApprovalValidationError } from './gig-candidate-approval/gig-candidate-approval';
import { GigCandidateApprovalService } from './gig-candidate-approval/gig-candidate-approval.service';
import type { GigApprovalResult } from './gig-candidate-approval/repositories/gig-candidate-approval.repository';
import { PostEditKind } from '../telegram/telegram-composer.service.types';
import { GigCandidateFeedbackService } from './gig-candidate-feedback.service';
import { GigCandidatePosterService } from './gig-candidate-poster/gig-candidate-poster.service';
import { BucketService } from '@modules/bucket/bucket.service';
import { AlertingService } from '@modules/alerting/alerting.service';
import { CommunityService } from '../location/community/community.service';

describe('GigCandidateService', () => {
  const jpegContentType = 'image/jpeg';

  let service: GigCandidateService;
  let approvalService: GigCandidateApprovalService;

  const gigCandidateRepositoryMock: {
    createId: ReturnType<typeof vi.fn>;
    createGigCandidate: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    appendGigCandidatePostIfAbsent: ReturnType<typeof vi.fn>;
    sendGigCandidateToModeration: ReturnType<typeof vi.fn>;
    rejectGigCandidate: ReturnType<typeof vi.fn>;
    updateGigCandidateDraft: ReturnType<typeof vi.fn>;
    updateGigCandidateModerationPostFileId: ReturnType<typeof vi.fn>;
  } = {
    createId: vi.fn(),
    createGigCandidate: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    appendGigCandidatePostIfAbsent: vi.fn(),
    sendGigCandidateToModeration: vi.fn(),
    rejectGigCandidate: vi.fn(),
    updateGigCandidateDraft: vi.fn(),
    updateGigCandidateModerationPostFileId: vi.fn(),
  };

  const gigPosterServiceMock = {
    upload: vi.fn(),
  };

  const approvalTransactionMock = {
    createGigId: vi.fn(),
    findGigCandidateById: vi.fn(),
    findGigById: vi.fn(),
    isGigPublicIdTaken: vi.fn(),
    approveGigCandidate: vi.fn(),
    createGig: vi.fn(),
  };

  const gigCandidateApprovalRepositoryMock = {
    withTransaction: vi.fn(),
  };

  const telegramServiceMock = {
    sendGigCandidateIntakePost: vi.fn(),
    sendGigCandidateModerationPost: vi.fn(),
    updateGigCandidateIntakePostAfterModeration: vi.fn(),
    sendGigCandidateFeedback: vi.fn(),
    updateRejectedGigCandidatePost: vi.fn(),
    editGigCandidatePost: vi.fn(),
    updateGigModerationPost: vi.fn(),
  };

  const telegramGigCandidateServiceMock = {
    sendIntakePost: telegramServiceMock.sendGigCandidateIntakePost,
    sendModerationPost: telegramServiceMock.sendGigCandidateModerationPost,
    updateIntakePostAfterModeration:
      telegramServiceMock.updateGigCandidateIntakePostAfterModeration,
    sendFeedback: telegramServiceMock.sendGigCandidateFeedback,
    updateRejectedPost: telegramServiceMock.updateRejectedGigCandidatePost,
    editPost: telegramServiceMock.editGigCandidatePost,
  };

  const userServiceMock = {
    findActiveUserById: vi.fn(),
  };

  const aiServiceMock = {
    lookupGig: vi.fn(),
  };

  const bucketServiceMock = {
    upload: vi.fn(),
  };

  const alertingServiceMock = {
    reportFailureBestEffort: vi.fn(),
  };

  const communityServiceMock = {
    findById: vi.fn(),
    findByRoute: vi.fn(),
  };

  const calendarServiceMock = { addEvent: vi.fn() };
  const gigFeedRevalidationServiceMock = {
    revalidateGigFeedOrThrow: vi.fn(),
  };
  const gigServiceMock = {
    generateUniquePublicId: vi.fn(),
    gigToCalendarPayload: vi.fn(),
  };

  async function createService(
    configService: ConfigService,
  ): Promise<GigCandidateService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidateService,
        GigCandidateApprovalService,
        GigCandidateFeedbackService,
        GigCandidatePosterService,
        {
          provide: GIG_CANDIDATE_REPOSITORY,
          useValue: gigCandidateRepositoryMock,
        },
        {
          provide: GIG_CANDIDATE_APPROVAL_REPOSITORY,
          useValue: gigCandidateApprovalRepositoryMock,
        },
        { provide: GigPosterService, useValue: gigPosterServiceMock },
        {
          provide: TelegramGigService,
          useValue: {
            updateModerationPost: telegramServiceMock.updateGigModerationPost,
          },
        },
        {
          provide: TelegramGigCandidateService,
          useValue: telegramGigCandidateServiceMock,
        },
        { provide: AiService, useValue: aiServiceMock },
        { provide: BucketService, useValue: bucketServiceMock },
        { provide: AlertingService, useValue: alertingServiceMock },
        { provide: CalendarService, useValue: calendarServiceMock },
        {
          provide: GigFeedRevalidationService,
          useValue: gigFeedRevalidationServiceMock,
        },
        { provide: GigService, useValue: gigServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: CommunityService, useValue: communityServiceMock },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    approvalService = module.get(GigCandidateApprovalService);
    return module.get(GigCandidateService);
  }

  beforeEach(async () => {
    gigPosterServiceMock.upload.mockResolvedValue(undefined);
    bucketServiceMock.upload.mockResolvedValue('/suggestions/image-id');
    gigServiceMock.generateUniquePublicId.mockImplementation(
      async (params: {
        isPublicIdTaken?: (publicId: string) => Promise<boolean>;
      }) => {
        await params.isPublicIdTaken?.('radiohead-2026-06-12');
        return 'radiohead-2026-06-12';
      },
    );
    gigCandidateApprovalRepositoryMock.withTransaction.mockImplementation(
      (
        work: (transaction: typeof approvalTransactionMock) => Promise<unknown>,
      ) => work(approvalTransactionMock),
    );
    userServiceMock.findActiveUserById.mockResolvedValue({
      id: '507f1f77bcf86cd799439088',
      status: 'active',
      roles: [],
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
        },
      ],
      createdAt: new Date('2026-08-22T10:00:00.000Z'),
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    communityServiceMock.findById.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });
    communityServiceMock.findByRoute.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });

    service = await createService(
      new ConfigService({
        SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS: '',
        DEFAULT_GIG_POSTER_URL: 'https://cdn.example/default.jpg',
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('createMessengerGigCandidate', () => {
    it('should create an anonymous messenger candidate with Barcelona location defaults', async () => {
      const gigCandidate = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          originalText: 'Radiohead in Barcelona',
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          city: 'Barcelona',
          country: 'ES',
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(gigCandidate.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(
        gigCandidate,
      );

      const result = await service.createMessengerGigCandidate({
        messenger: Messenger.Telegram,
        chatId: -100123,
        messageId: 42,
        originalText: 'Radiohead in Barcelona',
      });

      expect(result).toEqual(gigCandidate);
      expect(bucketServiceMock.upload).not.toHaveBeenCalled();
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).toHaveBeenCalledWith({
        gigCandidateId: gigCandidate.id,
        status: GigCandidateStatus.New,
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          originalText: 'Radiohead in Barcelona',
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          city: 'Barcelona',
          country: 'ES',
        },
      });
      expect(communityServiceMock.findByRoute).toHaveBeenCalledWith({
        countryIso: 'ES',
        communitySlug: 'barcelona',
      });
    });

    it('should upload and store an image-only messenger source', async () => {
      const imageBuffer = Buffer.from('image bytes');
      const gigCandidate = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          image: {
            bucketPath: '/suggestions/image-id',
            telegramFileId: 'telegram-image-file-id',
          },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          city: 'Barcelona',
          country: 'ES',
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(gigCandidate.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(
        gigCandidate,
      );

      const result = await service.createMessengerGigCandidate({
        messenger: Messenger.Telegram,
        chatId: -100123,
        messageId: 42,
        image: {
          buffer: imageBuffer,
          telegramFileId: 'telegram-image-file-id',
          contentType: 'image/jpeg',
        },
      });

      expect(result).toEqual(gigCandidate);
      expect(bucketServiceMock.upload).toHaveBeenCalledWith({
        key: expect.stringMatching(
          /^suggestions\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        buffer: imageBuffer,
        mimetype: 'image/jpeg',
      });
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).toHaveBeenCalledWith({
        gigCandidateId: gigCandidate.id,
        status: GigCandidateStatus.New,
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          image: {
            bucketPath: '/suggestions/image-id',
            telegramFileId: 'telegram-image-file-id',
          },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          city: 'Barcelona',
          country: 'ES',
        },
      });
    });

    const invalidImageCases = [
      {
        name: 'empty image buffer',
        image: {
          buffer: Buffer.alloc(0),
          telegramFileId: 'telegram-image-file-id',
          contentType: jpegContentType,
        },
        expectedMessage: 'image buffer must be non-empty',
      },
      {
        name: 'blank Telegram file ID',
        image: {
          buffer: Buffer.from('image'),
          telegramFileId: '   ',
          contentType: jpegContentType,
        },
        expectedMessage: 'image telegramFileId must be non-empty',
      },
    ] satisfies Array<{
      name: string;
      image: MessengerGigCandidateImage;
      expectedMessage: string;
    }>;

    it.each(invalidImageCases)(
      'should reject $name',
      async ({ image, expectedMessage }) => {
        await expect(
          service.createMessengerGigCandidate({
            messenger: Messenger.Telegram,
            chatId: -100123,
            messageId: 42,
            image,
          }),
        ).rejects.toThrowError(expectedMessage);
        expect(bucketServiceMock.upload).not.toHaveBeenCalled();
        expect(
          gigCandidateRepositoryMock.createGigCandidate,
        ).not.toHaveBeenCalled();
      },
    );

    it('should not create a candidate when the image upload fails', async () => {
      bucketServiceMock.upload.mockRejectedValueOnce(
        new Error('Bucket unavailable'),
      );

      await expect(
        service.createMessengerGigCandidate({
          messenger: Messenger.Telegram,
          chatId: -100123,
          messageId: 42,
          image: {
            buffer: Buffer.from('image'),
            telegramFileId: 'telegram-image-file-id',
            contentType: 'image/jpeg',
          },
        }),
      ).rejects.toThrowError('Bucket unavailable');
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).not.toHaveBeenCalled();
    });

    it('should associate a messenger candidate with an existing User', async () => {
      const userId = '507f1f77bcf86cd799439088';
      const gigCandidate = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          userId,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          originalText: 'Radiohead in Barcelona',
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          city: 'Barcelona',
          country: 'ES',
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(gigCandidate.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(
        gigCandidate,
      );

      await service.createMessengerGigCandidate({
        messenger: Messenger.Telegram,
        chatId: -100123,
        messageId: 42,
        originalText: 'Radiohead in Barcelona',
        userId,
      });

      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({ userId }),
        }),
      );
    });

    it.each([
      {
        name: 'zero chat id',
        chatId: 0,
        messageId: 42,
        originalText: 'Radiohead in Barcelona',
        expectedMessage: 'chatId must be a non-zero safe integer',
      },
      {
        name: 'non-positive message id',
        chatId: -100123,
        messageId: 0,
        originalText: 'Radiohead in Barcelona',
        expectedMessage: 'messageId must be a positive safe integer',
      },
      {
        name: 'blank original text',
        chatId: -100123,
        messageId: 42,
        originalText: '   ',
        expectedMessage: 'originalText must be non-empty when provided',
      },
    ])(
      'should reject $name',
      async ({ chatId, messageId, originalText, expectedMessage }) => {
        const createGigCandidate = service.createMessengerGigCandidate({
          messenger: Messenger.Telegram,
          chatId,
          messageId,
          originalText,
        });

        await expect(createGigCandidate).rejects.toThrowError(
          BadRequestException,
        );
        await expect(createGigCandidate).rejects.toThrowError(expectedMessage);
        expect(
          gigCandidateRepositoryMock.createGigCandidate,
        ).not.toHaveBeenCalled();
      },
    );

    it('should reject a messenger source without text or image', async () => {
      await expect(
        service.createMessengerGigCandidate({
          messenger: Messenger.Telegram,
          chatId: -100123,
          messageId: 42,
        }),
      ).rejects.toThrowError('originalText or image is required');
      expect(bucketServiceMock.upload).not.toHaveBeenCalled();
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).not.toHaveBeenCalled();
    });
  });

  describe('submitMessengerGigCandidate', () => {
    it('should send and store an Intake post for a Telegram suggestion', async () => {
      const gigCandidate = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          originalText: 'Radiohead in Barcelona',
        },
      });
      const withIntakePost = buildGigCandidate({
        ...gigCandidate,
        version: 1,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Intake,
            chatId: -1003001,
            id: 70,
            date: 1_790_013_012_000,
          },
        ],
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(gigCandidate.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(
        gigCandidate,
      );
      telegramServiceMock.sendGigCandidateIntakePost.mockResolvedValue({
        chatId: -1003001,
        messageId: 70,
        sentAtSeconds: 1_790_013_012,
      });
      gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent.mockResolvedValue(
        withIntakePost,
      );

      const result = await service.submitMessengerGigCandidate({
        messenger: Messenger.Telegram,
        chatId: -100123,
        messageId: 42,
        originalText: 'Radiohead in Barcelona',
      });

      expect(result).toEqual(withIntakePost);
      expect(
        telegramServiceMock.sendGigCandidateIntakePost,
      ).toHaveBeenCalledWith(gigCandidate);
      expect(
        gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent,
      ).toHaveBeenCalledWith({
        gigCandidateId: gigCandidate.id,
        expectedVersion: 0,
        post: {
          to: Messenger.Telegram,
          type: PostType.Intake,
          chatId: -1003001,
          id: 70,
          date: 1_790_013_012_000,
        },
      });
    });

    it('should keep the candidate when sending the Intake post fails', async () => {
      const gigCandidate = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          originalText: 'Radiohead in Barcelona',
        },
      });
      const loggerSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      gigCandidateRepositoryMock.createId.mockReturnValue(gigCandidate.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(
        gigCandidate,
      );
      telegramServiceMock.sendGigCandidateIntakePost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );

      const result = await service.submitMessengerGigCandidate({
        messenger: Messenger.Telegram,
        chatId: -100123,
        messageId: 42,
        originalText: 'Radiohead in Barcelona',
      });

      expect(result).toEqual(gigCandidate);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `sendGigCandidateIntakePost failed for gigCandidateId=${gigCandidate.id}`,
        ),
      );
      expect(
        gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent,
      ).not.toHaveBeenCalled();
    });
  });

  describe('handleSubmit', () => {
    it('should throw BadRequestException when title is missing', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: '',
              country: 'ES',
              city: 'Barcelona',
              date: '2026-08-01',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw BadRequestException when date is not YYYY-MM-DD', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'Band',
              country: 'ES',
              city: 'Barcelona',
              date: '01-08-2026',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toThrow(/date must be in YYYY-MM-DD/);
    });

    it('should throw BadRequestException when date does not exist in the calendar', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'Band',
              country: 'ES',
              city: 'Barcelona',
              date: '2026-02-31',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toThrow(/date must be a valid date/);
    });

    it('should throw BadRequestException when endDate is before date', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'Band',
              country: 'ES',
              city: 'Barcelona',
              date: '2026-08-10',
              endDate: '2026-08-09',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toThrow(/endDate must be on or after date/);
    });

    it('should reject posterUrl while external poster downloads are disabled', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'Band',
              country: 'ES',
              city: 'Barcelona',
              date: '2026-08-01',
              posterUrl: 'https://cdn.example/poster.jpg',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toThrow(/posterUrl is temporarily disabled/);
    });

    it('should throw BadRequestException when ticketsUrl is invalid', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'Band',
              country: 'ES',
              city: 'Barcelona',
              date: '2026-08-01',
              ticketsUrl: 'not-a-url',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toThrow(/ticketsUrl must be a valid URL/);
    });

    it('should reject a title longer than 300 characters', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'A'.repeat(301),
              country: 'ES',
              city: 'Barcelona',
              date: '2026-08-01',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toThrow(/title must contain at most 300 characters/);
    });

    it('should accept a one-character title and include it in submitted feedback', async () => {
      const created: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: GigSourceType.User,
          userId: '66a000000000000000000000099',
          origin: { type: GigSourceUserOriginType.Form },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'B',
          date: Date.parse('2026-08-01T00:00:00.000Z'),
          city: 'Barcelona',
          country: 'ES',
        },
        version: 0,
        status: GigCandidateStatus.New,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateIntakePost.mockResolvedValue(
        undefined,
      );

      const result = await service.handleSubmit({
        body: {
          gig: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'B',
            country: 'es',
            city: 'Barcelona',
            date: '2026-08-01',
          },
        },
        user: {
          userId: '66a000000000000000000000099',
          tgUser: {
            id: 99,
            username: 'fan',
            first_name: 'Fan',
            last_name: 'User',
          },
          isAdmin: false,
        },
        posterFile: undefined,
      });

      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          gigCandidateId: created.id,
          status: GigCandidateStatus.New,
          source: {
            type: GigSourceType.User,
            userId: '66a000000000000000000000099',
            origin: { type: GigSourceUserOriginType.Form },
          },
          gigDraft: expect.objectContaining({
            title: 'B',
            country: 'ES',
          }),
        }),
      );
      const createParams =
        gigCandidateRepositoryMock.createGigCandidate.mock.calls[0]?.[0];
      expect(createParams?.gigDraft).not.toHaveProperty('poster');
      expect(result).toEqual({ id: created.id });
      expect(gigPosterServiceMock.upload).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateIntakePost,
      ).toHaveBeenCalledWith(created, undefined);
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        {
          kind: 'submitted',
          subject: { type: 'gigTitle', title: 'B' },
          chatId: '42',
        },
      );
    });

    it('should append Intake post when Telegram returns a message', async () => {
      const created: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: GigSourceType.User,
          userId: '66a000000000000000000000001',
          origin: { type: GigSourceUserOriginType.Form },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Band',
          date: Date.parse('2026-08-01T00:00:00.000Z'),
          city: 'Barcelona',
          country: 'ES',
          poster: { bucketPath: 'gigs/ug' },
        },
        version: 0,
        status: GigCandidateStatus.New,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue({
        storedPoster: created.gigDraft.poster,
        posterFile: {
          buffer: Buffer.from('poster'),
          mimetype: 'image/jpeg',
          filename: 'poster.jpg',
        },
      });
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateIntakePost.mockResolvedValue({
        messageId: 55,
        chatId: -200,
        sentAtSeconds: 1_700_000_000,
        fileId: 'photo-1',
      });
      gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent.mockResolvedValue(
        {
          ...created,
          version: 1,
        },
      );

      await service.handleSubmit({
        body: {
          gig: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'Band',
            country: 'ES',
            city: 'Barcelona',
            date: '2026-08-01',
          },
        },
        user: {
          userId: '66a000000000000000000000001',
          tgUser: { id: 1, first_name: 'A' },
          isAdmin: false,
        },
        posterFile: {
          buffer: Buffer.from('poster'),
          mimetype: 'image/jpeg',
        },
      });

      expect(gigPosterServiceMock.upload).toHaveBeenCalledWith({
        url: undefined,
        file: {
          buffer: Buffer.from('poster'),
          mimetype: 'image/jpeg',
        },
        context: {
          date: Date.parse('2026-08-01T00:00:00.000Z'),
          city: 'Barcelona',
          country: 'ES',
          publicId: `gc-${created.id}`,
        },
      });
      expect(
        gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          gigCandidateId: created.id,
          expectedVersion: 0,
          post: expect.objectContaining({
            id: 55,
            chatId: -200,
            fileId: 'photo-1',
            type: PostType.Intake,
          }),
        }),
      );
    });

    it.each([
      {
        reason: 'no active User exists',
        user: null,
      },
      {
        reason: 'the active User has no Telegram identity',
        user: {
          id: '66a000000000000000000000001',
          status: 'active',
          roles: [],
          identities: [],
          createdAt: new Date('2026-08-22T10:00:00.000Z'),
          updatedAt: new Date('2026-08-22T10:00:00.000Z'),
        },
      },
    ])('should keep submission successful when $reason', async ({ user }) => {
      const created = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          userId: '66a000000000000000000000001',
          origin: { type: GigSourceUserOriginType.Form },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Band',
          date: Date.parse('2026-08-01T00:00:00.000Z'),
          city: 'Barcelona',
          country: 'ES',
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateIntakePost.mockResolvedValue(
        undefined,
      );
      userServiceMock.findActiveUserById.mockResolvedValue(user);

      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'Band',
              country: 'ES',
              city: 'Barcelona',
              date: '2026-08-01',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).resolves.toEqual({ id: created.id });
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
    });

    it('should keep submission successful without retrying failed feedback', async () => {
      const loggerWarnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const created = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          userId: '66a000000000000000000000001',
          origin: { type: GigSourceUserOriginType.Form },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Band',
          date: Date.parse('2026-08-01T00:00:00.000Z'),
          city: 'Barcelona',
          country: 'ES',
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateIntakePost.mockResolvedValue(
        undefined,
      );
      telegramServiceMock.sendGigCandidateFeedback.mockRejectedValueOnce(
        new Error('Telegram unavailable'),
      );

      await expect(
        service.handleSubmit({
          body: {
            gig: {
              communityIds: ['507f1f77bcf86cd799439011'],
              title: 'Band',
              country: 'ES',
              city: 'Barcelona',
              date: '2026-08-01',
            },
          },
          user: {
            userId: '66a000000000000000000000001',
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).resolves.toEqual({ id: created.id });
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).toHaveBeenCalledTimes(1);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `sendGigCandidateFeedback failed for gigCandidateId=${created.id}: Telegram unavailable`,
      );
    });
  });

  describe('getByIdOrThrow', () => {
    it('should throw NotFoundException when GigCandidate does not exist', async () => {
      gigCandidateRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.getByIdOrThrow('507f1f77bcf86cd799439099'),
      ).rejects.toThrow(/GigCandidate with ID/);
    });
  });

  describe('createAdminGigCandidate', () => {
    it('should create Reviewing GigCandidate with admin origin', async () => {
      const gigCandidateId = '507f1f77bcf86cd799439099';
      const userId = '507f1f77bcf86cd799439088';
      const created = buildGigCandidate({
        id: gigCandidateId,
        status: GigCandidateStatus.Reviewing,
        source: {
          type: GigSourceType.User,
          userId,
          origin: { type: GigSourceUserOriginType.Admin },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Band',
          poster: { bucketPath: 'gigs/default.jpg' },
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(gigCandidateId);
      gigPosterServiceMock.upload.mockResolvedValue({
        storedPoster: created.gigDraft.poster!,
        posterFile: {
          buffer: Buffer.from('default poster'),
          mimetype: 'image/jpeg',
          filename: 'poster.jpg',
        },
      });
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue(
        undefined,
      );

      await expect(
        service.createAdminGigCandidate({
          userId,
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'Band',
          },
        }),
      ).resolves.toEqual(created);
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).toHaveBeenCalledWith({
        gigCandidateId,
        status: GigCandidateStatus.Reviewing,
        source: {
          type: GigSourceType.User,
          userId,
          origin: { type: GigSourceUserOriginType.Admin },
        },
        gigDraft: created.gigDraft,
      });
      expect(
        telegramServiceMock.sendGigCandidateIntakePost,
      ).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).toHaveBeenCalledWith(created, {
        buffer: Buffer.from('default poster'),
        filename: 'poster.jpg',
        contentType: 'image/jpeg',
      });
    });

    it('should reject an inactive Community before creating an admin GigCandidate', async () => {
      communityServiceMock.findById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        countryIso: 'ES',
        slug: 'barcelona',
        nameTranslationKey: 'barcelona.name',
        timeZone: 'Europe/Madrid',
        isActive: false,
      });

      await expect(
        service.createAdminGigCandidate({
          userId: '507f1f77bcf86cd799439088',
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'Band',
          },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(gigPosterServiceMock.upload).not.toHaveBeenCalled();
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).not.toHaveBeenCalled();
    });

    it.each([
      { communityIds: [] },
      { communityIds: ['invalid'] },
      {
        communityIds: ['507f1f77bcf86cd799439011', '507F1F77BCF86CD799439011'],
      },
    ])(
      'should reject invalid Community assignments %# before creating an admin GigCandidate',
      async ({ communityIds }) => {
        await expect(
          service.createAdminGigCandidate({
            userId: '507f1f77bcf86cd799439088',
            gigDraft: { communityIds, title: 'Band' },
          }),
        ).rejects.toThrow(BadRequestException);
        expect(communityServiceMock.findById).not.toHaveBeenCalled();
        expect(gigPosterServiceMock.upload).not.toHaveBeenCalled();
        expect(
          gigCandidateRepositoryMock.createGigCandidate,
        ).not.toHaveBeenCalled();
      },
    );

    it('should send admin lifecycle feedback only when enabled', async () => {
      const created = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Band',
          poster: { bucketPath: 'gigs/default.jpg' },
        },
        source: {
          type: GigSourceType.User,
          userId: '507f1f77bcf86cd799439088',
          origin: { type: GigSourceUserOriginType.Admin },
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue({
        storedPoster: created.gigDraft.poster!,
        posterFile: {
          buffer: Buffer.from('default poster'),
          filename: 'poster.jpg',
          mimetype: 'image/jpeg',
        },
      });
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue(
        undefined,
      );
      userServiceMock.findActiveUserById.mockResolvedValue({
        id: '507f1f77bcf86cd799439088',
        status: 'active',
        roles: [UserRole.Admin],
        identities: [
          {
            type: 'messenger',
            messenger: Messenger.Telegram,
            externalUserId: '42',
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createAdminGigCandidate({
        userId: '507f1f77bcf86cd799439088',
        gigDraft: { communityIds: ['507f1f77bcf86cd799439011'] },
      });
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
      expect(userServiceMock.findActiveUserById).not.toHaveBeenCalled();

      service = await createService(
        new ConfigService({
          SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS: 'true',
          DEFAULT_GIG_POSTER_URL: 'https://cdn.example/default.jpg',
        }),
      );
      await service.createAdminGigCandidate({
        userId: '507f1f77bcf86cd799439088',
        gigDraft: { communityIds: ['507f1f77bcf86cd799439011'] },
      });
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        {
          kind: 'acceptedForModeration',
          subject: { type: 'gigTitle', title: 'Band' },
          chatId: '42',
        },
      );
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).toHaveBeenCalledTimes(1);
      expect(userServiceMock.findActiveUserById).toHaveBeenCalledTimes(1);
    });

    it('should skip accepted-for-moderation feedback when the title and source message are missing', async () => {
      const created = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        source: {
          type: GigSourceType.User,
          userId: '507f1f77bcf86cd799439088',
          origin: { type: GigSourceUserOriginType.Admin },
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          poster: { bucketPath: 'gigs/default.jpg' },
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue({
        storedPoster: created.gigDraft.poster!,
        posterFile: {
          buffer: Buffer.from('default poster'),
          filename: 'poster.jpg',
          mimetype: 'image/jpeg',
        },
      });
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue(
        undefined,
      );
      service = await createService(
        new ConfigService({
          SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS: 'true',
          DEFAULT_GIG_POSTER_URL: 'https://cdn.example/default.jpg',
        }),
      );

      await service.createAdminGigCandidate({
        userId: '507f1f77bcf86cd799439088',
        gigDraft: { communityIds: ['507f1f77bcf86cd799439011'] },
      });

      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
      expect(userServiceMock.findActiveUserById).toHaveBeenCalledTimes(1);
    });

    it('should store a direct Moderation post for an admin-created GigCandidate', async () => {
      const posterFile = {
        buffer: Buffer.from('poster'),
        mimetype: 'image/jpeg',
      };
      const preparedPosterFile = {
        ...posterFile,
        filename: 'poster.jpg',
      };
      const created = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        source: {
          type: GigSourceType.User,
          userId: '507f1f77bcf86cd799439088',
          origin: { type: GigSourceUserOriginType.Admin },
        },
      });
      const stored = buildGigCandidate({
        ...created,
        version: 1,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            date: 1_700_000_001_000,
            id: 50,
            chatId: -200,
            fileId: 'moderation-file-id',
          },
        ],
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue({
        storedPoster: { bucketPath: 'gigs/gig-candidate.jpg' },
        posterFile: preparedPosterFile,
      });
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue({
        messageId: 50,
        chatId: -200,
        sentAtSeconds: 1_700_000_001,
        fileId: 'moderation-file-id',
      });
      gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent.mockResolvedValue(
        stored,
      );

      await expect(
        service.createAdminGigCandidate({
          userId: '507f1f77bcf86cd799439088',
          gigDraft: { communityIds: ['507f1f77bcf86cd799439011'] },
          posterFile,
        }),
      ).resolves.toEqual(stored);
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).toHaveBeenCalledWith(created, {
        buffer: preparedPosterFile.buffer,
        filename: preparedPosterFile.filename,
        contentType: preparedPosterFile.mimetype,
      });
      expect(
        gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          gigCandidateId: created.id,
          expectedVersion: 0,
          post: expect.objectContaining({ type: PostType.Moderation }),
        }),
      );
    });
  });

  describe('updateAdminGigCandidateDraft', () => {
    it('should preserve stored poster when update has no new poster input', async () => {
      const poster = { bucketPath: 'gigCandidate/poster.jpg' };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Old title',
          poster,
        },
      });
      const updated = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'New title',
          poster,
        },
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.updateGigCandidateDraft.mockResolvedValue(
        updated,
      );

      await expect(
        service.updateAdminGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'New title',
          },
        }),
      ).resolves.toEqual(updated);
      expect(
        gigCandidateRepositoryMock.updateGigCandidateDraft,
      ).toHaveBeenCalledWith({
        gigCandidateId: reviewing.id,
        expectedVersion: 0,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'New title',
          poster,
        },
      });
      expect(gigPosterServiceMock.upload).not.toHaveBeenCalled();
    });

    it('should replace moderation media and store its new fileId', async () => {
      const poster = { bucketPath: 'gigCandidate/poster.jpg' };
      const posterFile = { buffer: Buffer.from('new poster') };
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
        fileId: 'old-file-id',
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Old title',
          poster,
        },
        posts: [moderationPost],
      });
      const updated = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'New title',
          poster,
        },
        posts: [moderationPost],
      });
      const persisted = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
        gigDraft: updated.gigDraft,
        posts: [{ ...moderationPost, fileId: 'new-file-id' }],
      });
      gigPosterServiceMock.upload.mockResolvedValue({
        storedPoster: poster,
        posterFile: { ...posterFile, filename: 'poster.jpg' },
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.updateGigCandidateDraft.mockResolvedValue(
        updated,
      );
      telegramServiceMock.editGigCandidatePost.mockResolvedValue({
        kind: PostEditKind.Media,
        message: {
          message_id: moderationPost.id,
          date: 1_700_000_002,
          chat: { id: moderationPost.chatId, type: 'channel' },
        },
        fileId: 'new-file-id',
      });
      gigCandidateRepositoryMock.updateGigCandidateModerationPostFileId.mockResolvedValue(
        persisted,
      );

      await expect(
        service.updateAdminGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'New title',
          },
          posterFile,
        }),
      ).resolves.toEqual(persisted);
      expect(telegramServiceMock.editGigCandidatePost).toHaveBeenCalledWith({
        gigCandidate: updated,
        post: moderationPost,
        isMediaUpdateRequired: true,
        posterFile: {
          buffer: posterFile.buffer,
          filename: 'poster.jpg',
        },
      });
      expect(
        gigCandidateRepositoryMock.updateGigCandidateModerationPostFileId,
      ).toHaveBeenCalledWith({
        gigCandidateId: reviewing.id,
        expectedVersion: 1,
        messageId: 50,
        chatId: -200,
        fileId: 'new-file-id',
      });
    });
  });

  describe('lookupGigCandidateDraft', () => {
    it('should return AI lookup data without writing GigCandidate state', async () => {
      const lookupResult = {
        title: 'Band',
        date: '2026-09-20',
        city: 'Barcelona',
        country: 'ES',
        venue: 'Venue',
        ticketsUrl: 'https://tickets.example/gig',
      };
      aiServiceMock.lookupGig.mockResolvedValue(lookupResult);

      await expect(
        service.lookupGigCandidateDraft({
          title: 'Band',
          location: 'Barcelona, ES',
        }),
      ).resolves.toEqual(lookupResult);
      expect(aiServiceMock.lookupGig).toHaveBeenCalledWith({
        name: 'Band',
        location: 'Barcelona, ES',
      });
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).not.toHaveBeenCalled();
      expect(
        gigCandidateRepositoryMock.updateGigCandidateDraft,
      ).not.toHaveBeenCalled();
    });
  });

  describe('sendGigCandidateToModeration', () => {
    it('should keep New status when no moderation poster can be prepared', async () => {
      service = await createService(
        new ConfigService({
          SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS: '',
          DEFAULT_GIG_POSTER_URL: '',
        }),
      );
      const newGigCandidate = buildGigCandidate({
        gigDraft: { communityIds: ['507f1f77bcf86cd799439011'], title: 'Band' },
        version: 1,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: newGigCandidate.id,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(
        `Cannot prepare GigCandidate ${newGigCandidate.id} for moderation without a poster.`,
      );
      expect(
        gigCandidateRepositoryMock.sendGigCandidateToModeration,
      ).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).not.toHaveBeenCalled();
    });

    it('should use a messenger source image before the default poster', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
        fileId: 'intake-source-image-file-id',
      };
      const newGigCandidate = buildGigCandidate({
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          image: {
            bucketPath: '/suggestions/image-id',
            telegramFileId: 'source-image-file-id',
          },
        },
        gigDraft: { communityIds: ['507f1f77bcf86cd799439011'], title: 'Band' },
        version: 1,
        posts: [intakePost],
      });
      const reviewing = buildGigCandidate({
        ...newGigCandidate,
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.sendGigCandidateToModeration.mockResolvedValue(
        reviewing,
      );
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue(
        undefined,
      );

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: newGigCandidate.id,
          expectedVersion: 1,
        }),
      ).resolves.toEqual(reviewing);

      expect(gigPosterServiceMock.upload).not.toHaveBeenCalled();
      expect(
        gigCandidateRepositoryMock.sendGigCandidateToModeration,
      ).toHaveBeenCalledWith({
        gigCandidateId: newGigCandidate.id,
        expectedVersion: 1,
      });
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).toHaveBeenCalledWith(reviewing, undefined);
    });

    it('should commit moderation once and not retry failed feedback', async () => {
      const loggerWarnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const newGigCandidate = buildGigCandidate({
        gigDraft: { communityIds: ['507f1f77bcf86cd799439011'], title: 'Band' },
        version: 1,
        posts: [intakePost],
      });
      const reviewing = buildGigCandidate({
        ...newGigCandidate,
        gigDraft: {
          ...newGigCandidate.gigDraft,
          poster: { bucketPath: 'gigs/default.jpg' },
        },
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
        fileId: 'moderation-file-id',
      };
      const stored = buildGigCandidate({
        ...reviewing,
        version: 3,
        posts: [intakePost, moderationPost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigPosterServiceMock.upload.mockResolvedValue({
        storedPoster: reviewing.gigDraft.poster!,
        posterFile: {
          buffer: Buffer.from('default poster'),
          filename: 'poster.jpg',
          mimetype: 'image/jpeg',
        },
      });
      gigCandidateRepositoryMock.sendGigCandidateToModeration.mockResolvedValue(
        reviewing,
      );
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue({
        messageId: moderationPost.id,
        chatId: moderationPost.chatId,
        sentAtSeconds: 1_700_000_001,
        fileId: moderationPost.fileId,
      });
      gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent.mockResolvedValue(
        stored,
      );
      telegramServiceMock.updateGigCandidateIntakePostAfterModeration.mockResolvedValue(
        undefined,
      );
      telegramServiceMock.sendGigCandidateFeedback.mockRejectedValueOnce(
        new Error('Telegram unavailable'),
      );

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: newGigCandidate.id,
          expectedVersion: 1,
        }),
      ).resolves.toEqual(stored);
      expect(
        gigCandidateRepositoryMock.sendGigCandidateToModeration,
      ).toHaveBeenCalledWith({
        gigCandidateId: newGigCandidate.id,
        expectedVersion: 1,
        poster: reviewing.gigDraft.poster,
      });
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).toHaveBeenCalledWith(reviewing, {
        buffer: Buffer.from('default poster'),
        filename: 'poster.jpg',
        contentType: 'image/jpeg',
      });
      expect(
        gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          gigCandidateId: newGigCandidate.id,
          expectedVersion: 2,
          post: expect.objectContaining({ type: PostType.Moderation }),
        }),
      );
      expect(
        telegramServiceMock.updateGigCandidateIntakePostAfterModeration,
      ).toHaveBeenCalledWith({
        gigCandidate: stored,
        intakePost,
        moderationPost,
      });
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        {
          kind: 'acceptedForModeration',
          subject: { type: 'gigTitle', title: 'Band' },
          chatId: '42',
        },
      );
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).toHaveBeenCalledTimes(1);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `sendGigCandidateFeedback failed for gigCandidateId=${stored.id}: Telegram unavailable`,
      );
    });

    it('should preserve Intake actions for retry when sending Moderation fails', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const newGigCandidate = buildGigCandidate({
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          poster: { bucketPath: 'gigs/poster.jpg' },
        },
        version: 1,
        posts: [intakePost],
      });
      const reviewing = buildGigCandidate({
        gigDraft: newGigCandidate.gigDraft,
        status: GigCandidateStatus.Reviewing,
        version: 2,
        posts: [intakePost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.sendGigCandidateToModeration.mockResolvedValue(
        reviewing,
      );
      telegramServiceMock.sendGigCandidateModerationPost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: newGigCandidate.id,
          expectedVersion: 1,
        }),
      ).resolves.toEqual(reviewing);
      expect(
        telegramServiceMock.updateGigCandidateIntakePostAfterModeration,
      ).not.toHaveBeenCalled();
    });

    it('should not transition a Reviewing GigCandidate twice on repeated callback', async () => {
      const reviewing = buildGigCandidate({
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          poster: { bucketPath: 'gigs/poster.jpg' },
        },
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue(
        undefined,
      );

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
        }),
      ).resolves.toEqual(reviewing);
      expect(
        gigCandidateRepositoryMock.sendGigCandidateToModeration,
      ).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
    });

    it('should not duplicate an existing Moderation post', async () => {
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const reviewing = buildGigCandidate({
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          poster: { bucketPath: 'gigs/poster.jpg' },
        },
        status: GigCandidateStatus.Reviewing,
        version: 3,
        posts: [moderationPost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: reviewing.id,
          expectedVersion: 1,
        }),
      ).resolves.toEqual(reviewing);
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).not.toHaveBeenCalled();
      expect(
        gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent,
      ).not.toHaveBeenCalled();
    });

    it('should retry only the Intake handoff update after its first failure', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const reviewing = buildGigCandidate({
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          poster: { bucketPath: 'gigs/poster.jpg' },
        },
        status: GigCandidateStatus.Reviewing,
        version: 3,
        posts: [intakePost, moderationPost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      telegramServiceMock.updateGigCandidateIntakePostAfterModeration
        .mockRejectedValueOnce(new Error('Telegram update failed'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: reviewing.id,
          expectedVersion: 1,
        }),
      ).resolves.toEqual(reviewing);
      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: reviewing.id,
          expectedVersion: 1,
        }),
      ).resolves.toEqual(reviewing);

      expect(
        telegramServiceMock.updateGigCandidateIntakePostAfterModeration,
      ).toHaveBeenCalledTimes(2);
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).not.toHaveBeenCalled();
    });
  });

  describe('approveGigCandidate', () => {
    it('should approve and create one complete visible Gig in the transaction', async () => {
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          originalText: 'Private intake text',
        },
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          poster: { bucketPath: 'posters/radiohead.jpg' },
        },
        posts: [moderationPost],
      });
      const approved = buildGigCandidate({
        ...reviewing,
        status: GigCandidateStatus.Approved,
        version: 1,
        posts: [],
        gigId: '507f1f77bcf86cd799439011',
        approvedAt: new Date('2026-09-01T12:00:00.000Z'),
        approvedByUserId: '507f1f77bcf86cd799439077',
      });
      const gig = buildGigApprovalResult();
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);
      approvalTransactionMock.createGigId.mockReturnValue(gig.id);
      approvalTransactionMock.isGigPublicIdTaken.mockResolvedValue(false);
      approvalTransactionMock.approveGigCandidate.mockResolvedValue(approved);
      approvalTransactionMock.createGig.mockResolvedValue(gig);
      gigServiceMock.gigToCalendarPayload.mockReturnValue({ event: true });

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          approvedByUserId: approved.approvedByUserId!,
        }),
      ).resolves.toEqual(gig);

      expect(approvalTransactionMock.approveGigCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigId: gig.id,
          approvedByUserId: approved.approvedByUserId,
          approvedAt: expect.any(Date),
          moderationPost,
        }),
      );
      expect(approvalTransactionMock.createGig).toHaveBeenCalledWith({
        gigId: gig.id,
        communityIds: ['507f1f77bcf86cd799439011'],
        publicId: gig.publicId,
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        poster: { bucketPath: 'posters/radiohead.jpg' },
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
          },
        },
        moderationPost,
      });
      expect(gigServiceMock.generateUniquePublicId).toHaveBeenCalledWith({
        title: 'Radiohead',
        yyyyMmDd: '2026-06-12',
        isPublicIdTaken: expect.any(Function),
      });
      expect(approvalTransactionMock.isGigPublicIdTaken).toHaveBeenCalledWith(
        'radiohead-2026-06-12',
      );
      expect(
        gigFeedRevalidationServiceMock.revalidateGigFeedOrThrow,
      ).toHaveBeenCalledWith({
        country: gig.country,
        city: gig.city,
      });
      expect(calendarServiceMock.addEvent).toHaveBeenCalledWith({
        event: true,
      });
      expect(telegramServiceMock.updateGigModerationPost).toHaveBeenCalledWith({
        gigId: gig.id,
        expectedVersion: gig.version,
        isVisible: gig.isVisible,
        title: gig.title,
        publicId: gig.publicId,
        moderationPost: { chatId: -200, messageId: 50 },
      });
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
    });

    it('should stop before writing when multiple Moderation posts are present', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          poster: { bucketPath: 'posters/radiohead.jpg' },
        },
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            fileId: 'moderation-file-id-1',
            date: 1_700_000_001_000,
            id: 50,
            chatId: -200,
          },
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            fileId: 'moderation-file-id-2',
            date: 1_700_000_002_000,
            id: 51,
            chatId: -200,
          },
        ],
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: reviewing.version,
          approvedByUserId: '507f1f77bcf86cd799439077',
        }),
      ).rejects.toThrow(
        `GigCandidate ${reviewing.id} has multiple Telegram Moderation posts.`,
      );
      expect(
        approvalTransactionMock.approveGigCandidate,
      ).not.toHaveBeenCalled();
      expect(approvalTransactionMock.createGig).not.toHaveBeenCalled();
    });

    it('should abort before Gig allocation when expected version is stale', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 1,
          approvedByUserId: '507f1f77bcf86cd799439077',
        }),
      ).rejects.toMatchObject({
        name: GigCandidateConflictError.name,
        reason: 'versionConflict',
      });
      expect(approvalTransactionMock.createGigId).not.toHaveBeenCalled();
      expect(approvalTransactionMock.createGig).not.toHaveBeenCalled();
    });

    it('should leave Reviewing unchanged when gigDraft validation fails', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Incomplete',
        },
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          approvedByUserId: '507f1f77bcf86cd799439077',
        }),
      ).rejects.toBeInstanceOf(GigCandidateApprovalValidationError);
      expect(
        approvalTransactionMock.approveGigCandidate,
      ).not.toHaveBeenCalled();
      expect(approvalTransactionMock.createGig).not.toHaveBeenCalled();
    });

    it('should return the existing Gig for an already Approved GigCandidate', async () => {
      const gig = buildGigApprovalResult();
      const approved = buildGigCandidate({
        status: GigCandidateStatus.Approved,
        version: 1,
        gigId: gig.id,
        approvedAt: new Date('2026-09-01T12:00:00.000Z'),
        approvedByUserId: '507f1f77bcf86cd799439077',
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(approved);
      approvalTransactionMock.findGigById.mockResolvedValue(gig);

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: approved.id,
          expectedVersion: 0,
          approvedByUserId: '507f1f77bcf86cd799439077',
        }),
      ).resolves.toEqual(gig);
      expect(
        approvalTransactionMock.approveGigCandidate,
      ).not.toHaveBeenCalled();
      expect(approvalTransactionMock.createGig).not.toHaveBeenCalled();
      expect(
        gigFeedRevalidationServiceMock.revalidateGigFeedOrThrow,
      ).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
    });

    it('should skip submitter feedback for a provider-origin GigCandidate', async () => {
      const source: GigCandidate['source'] = {
        type: GigSourceType.Provider,
        provider: {
          name: 'exampleProvider',
          externalEventId: 'event-1',
          sourceUrl: 'https://provider.example/events/1',
          fetchedAt: new Date(),
        },
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        source,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          poster: { bucketPath: 'posters/radiohead.jpg' },
        },
      });
      const gig = buildGigApprovalResult({ source });
      const approved = buildGigCandidate({
        ...reviewing,
        status: GigCandidateStatus.Approved,
        version: 1,
        gigId: gig.id,
        approvedAt: new Date(),
        approvedByUserId: '507f1f77bcf86cd799439077',
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);
      approvalTransactionMock.createGigId.mockReturnValue(gig.id);
      approvalTransactionMock.isGigPublicIdTaken.mockResolvedValue(false);
      approvalTransactionMock.approveGigCandidate.mockResolvedValue(approved);
      approvalTransactionMock.createGig.mockResolvedValue(gig);

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          approvedByUserId: approved.approvedByUserId!,
        }),
      ).resolves.toEqual(gig);
      expect(userServiceMock.findActiveUserById).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
    });

    it('should not create a Gig when the conditional approval loses a race', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          poster: { bucketPath: 'posters/radiohead.jpg' },
        },
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);
      approvalTransactionMock.createGigId.mockReturnValue(
        '507f1f77bcf86cd799439011',
      );
      approvalTransactionMock.isGigPublicIdTaken.mockResolvedValue(false);
      approvalTransactionMock.approveGigCandidate.mockResolvedValue(null);

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          approvedByUserId: '507f1f77bcf86cd799439077',
        }),
      ).rejects.toMatchObject({
        name: GigCandidateConflictError.name,
        reason: 'concurrentModification',
      });
      expect(approvalTransactionMock.createGig).not.toHaveBeenCalled();
    });

    it('should preserve approved state when every post-commit integration fails', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          poster: { bucketPath: 'posters/radiohead.jpg' },
        },
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            fileId: 'moderation-file-id',
            date: 1_700_000_001_000,
            id: 50,
            chatId: -200,
          },
        ],
      });
      const gig = buildGigApprovalResult();
      const approved = buildGigCandidate({
        ...reviewing,
        status: GigCandidateStatus.Approved,
        version: 1,
        gigId: gig.id,
        approvedAt: new Date(),
        approvedByUserId: '507f1f77bcf86cd799439077',
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);
      approvalTransactionMock.createGigId.mockReturnValue(gig.id);
      approvalTransactionMock.isGigPublicIdTaken.mockResolvedValue(false);
      approvalTransactionMock.approveGigCandidate.mockResolvedValue(approved);
      approvalTransactionMock.createGig.mockResolvedValue(gig);
      gigServiceMock.gigToCalendarPayload.mockReturnValue({ event: true });
      gigFeedRevalidationServiceMock.revalidateGigFeedOrThrow.mockRejectedValue(
        new Error('Revalidation unavailable'),
      );
      calendarServiceMock.addEvent.mockRejectedValue(
        new Error('Calendar unavailable'),
      );
      telegramServiceMock.updateGigModerationPost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );
      telegramServiceMock.sendGigCandidateFeedback.mockRejectedValueOnce(
        new Error('Telegram feedback unavailable'),
      );

      await expect(
        approvalService.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          approvedByUserId: '507f1f77bcf86cd799439077',
        }),
      ).resolves.toEqual(gig);
      expect(calendarServiceMock.addEvent).toHaveBeenCalledOnce();
      expect(
        telegramServiceMock.updateGigModerationPost,
      ).toHaveBeenCalledOnce();
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).toHaveBeenCalledOnce();
    });
  });

  describe('rejectGigCandidate', () => {
    it('should conditionally reject New GigCandidate with audit fields', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const newGigCandidate = buildGigCandidate({
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Rejected gig',
        },
        posts: [intakePost],
      });
      const rejectedByUserId = '507f1f77bcf86cd799439077';
      const rejected = buildGigCandidate({
        status: GigCandidateStatus.Rejected,
        version: 1,
        rejectedAt: new Date('2026-08-24T12:00:00.000Z'),
        rejectedByUserId,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Rejected gig',
        },
        posts: [intakePost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);
      telegramServiceMock.updateRejectedGigCandidatePost.mockResolvedValue(
        undefined,
      );

      await expect(
        service.rejectGigCandidate({
          gigCandidateId: newGigCandidate.id,
          expectedVersion: 0,
          rejectedByUserId,
        }),
      ).resolves.toEqual(rejected);
      expect(
        gigCandidateRepositoryMock.rejectGigCandidate,
      ).toHaveBeenCalledWith({
        gigCandidateId: newGigCandidate.id,
        expectedVersion: 0,
        rejectedByUserId: rejected.rejectedByUserId,
        rejectedAt: expect.any(Date),
      });
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        {
          kind: 'rejected',
          subject: { type: 'gigTitle', title: 'Rejected gig' },
          chatId: '42',
        },
      );
      expect(
        telegramServiceMock.updateRejectedGigCandidatePost,
      ).toHaveBeenCalledWith({ gigCandidate: rejected, post: intakePost });
    });

    it('should use the source message for known chat user feedback when the title is missing', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const source: GigCandidate['source'] = {
        type: GigSourceType.User,
        userId: '507f1f77bcf86cd799439088',
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 42 },
        },
        originalText: 'Radiohead in Barcelona',
      };
      const newGigCandidate = buildGigCandidate({
        source,
        posts: [intakePost],
      });
      const rejected = buildGigCandidate({
        source,
        status: GigCandidateStatus.Rejected,
        version: 1,
        rejectedAt: new Date('2026-08-24T12:00:00.000Z'),
        rejectedByUserId: '507f1f77bcf86cd799439077',
        posts: [intakePost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);
      telegramServiceMock.updateRejectedGigCandidatePost.mockResolvedValue(
        undefined,
      );

      await service.rejectGigCandidate({
        gigCandidateId: newGigCandidate.id,
        expectedVersion: 0,
        rejectedByUserId: rejected.rejectedByUserId!,
      });

      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        {
          kind: 'rejected',
          subject: {
            type: 'chatMessage',
            chatId: -100123,
            messageId: 42,
          },
          chatId: '42',
        },
      );
      expect(userServiceMock.findActiveUserById).toHaveBeenCalledWith(
        source.userId,
      );
    });

    it('should skip rejected feedback when the chat user is unknown', async () => {
      const loggerWarnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const source: GigCandidate['source'] = {
        type: GigSourceType.User,
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 42 },
        },
        originalText: 'Radiohead in Barcelona',
      };
      const newGigCandidate = buildGigCandidate({ source });
      const rejected = buildGigCandidate({
        source,
        status: GigCandidateStatus.Rejected,
        version: 1,
        rejectedAt: new Date('2026-08-24T12:00:00.000Z'),
        rejectedByUserId: '507f1f77bcf86cd799439077',
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);

      await service.rejectGigCandidate({
        gigCandidateId: newGigCandidate.id,
        expectedVersion: 0,
        rejectedByUserId: rejected.rejectedByUserId!,
      });

      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
      expect(userServiceMock.findActiveUserById).not.toHaveBeenCalled();
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('should preserve rejected state and Intake reference when Telegram update fails', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const newGigCandidate = buildGigCandidate({ posts: [intakePost] });
      const rejected = buildGigCandidate({
        status: GigCandidateStatus.Rejected,
        version: 1,
        rejectedAt: new Date('2026-08-24T12:00:00.000Z'),
        rejectedByUserId: '507f1f77bcf86cd799439077',
        posts: [intakePost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);
      telegramServiceMock.updateRejectedGigCandidatePost.mockRejectedValue(
        new Error('Telegram update failed'),
      );

      await expect(
        service.rejectGigCandidate({
          gigCandidateId: newGigCandidate.id,
          expectedVersion: 0,
          rejectedByUserId: rejected.rejectedByUserId!,
        }),
      ).resolves.toEqual(rejected);
      expect(
        telegramServiceMock.updateRejectedGigCandidatePost,
      ).toHaveBeenCalledWith({ gigCandidate: rejected, post: intakePost });
    });

    it('should preserve rejection and suppress the expected feedback warning when the Telegram chat is unavailable', async () => {
      const loggerWarnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Rejected gig',
        },
        posts: [intakePost, moderationPost],
      });
      const rejected = buildGigCandidate({
        status: GigCandidateStatus.Rejected,
        version: 1,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Rejected gig',
        },
        posts: [intakePost, moderationPost],
        rejectedAt: new Date(),
        rejectedByUserId: '507f1f77bcf86cd799439077',
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);
      telegramServiceMock.updateRejectedGigCandidatePost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );
      telegramServiceMock.sendGigCandidateFeedback.mockRejectedValue({
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            ok: false,
            error_code: 400,
            description: 'Bad Request: chat not found',
          },
        },
      });

      await expect(
        service.rejectGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          rejectedByUserId: rejected.rejectedByUserId!,
        }),
      ).resolves.toEqual(rejected);
      expect(
        telegramServiceMock.updateRejectedGigCandidatePost,
      ).toHaveBeenCalledWith({ gigCandidate: rejected, post: moderationPost });
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).toHaveBeenCalledOnce();
      expect(loggerWarnSpy).not.toHaveBeenCalledWith(
        'sendGigCandidateFeedback failed for gigCandidateId=507f1f77bcf86cd799439099: Request failed with status code 400; httpStatus=400; telegramErrorCode=400; telegramDescription=Bad Request: chat not found',
      );
    });

    it('should return illegal-transition conflict for repeated rejection', async () => {
      const rejectedByUserId = '507f1f77bcf86cd799439077';
      const rejected = buildGigCandidate({
        status: GigCandidateStatus.Rejected,
        version: 1,
        rejectedAt: new Date('2026-08-24T12:00:00.000Z'),
        rejectedByUserId,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(rejected);

      await expect(
        service.rejectGigCandidate({
          gigCandidateId: rejected.id,
          expectedVersion: 1,
          rejectedByUserId,
        }),
      ).rejects.toMatchObject({
        name: GigCandidateConflictError.name,
        command: GigCandidateCommand.Reject,
        reason: 'illegalTransition',
      });
      expect(
        gigCandidateRepositoryMock.rejectGigCandidate,
      ).not.toHaveBeenCalled();
    });
  });

  describe('updateGigCandidateDraft', () => {
    it('should conditionally update Reviewing gigDraft', async () => {
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        posts: [moderationPost],
      });
      const updated = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Updated title',
        },
        posts: [moderationPost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.updateGigCandidateDraft.mockResolvedValue(
        updated,
      );

      await expect(
        service.updateGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'Updated title',
          },
        }),
      ).resolves.toEqual(updated);
      expect(
        gigCandidateRepositoryMock.updateGigCandidateDraft,
      ).toHaveBeenCalledWith({
        gigCandidateId: reviewing.id,
        expectedVersion: 0,
        gigDraft: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 'Updated title',
        },
      });
      expect(telegramServiceMock.editGigCandidatePost).toHaveBeenCalledWith({
        gigCandidate: updated,
        post: moderationPost,
        isMediaUpdateRequired: false,
        posterFile: undefined,
      });
    });

    it('should not store a fileId when Telegram returns no photo after media edit', async () => {
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
        fileId: 'old-file-id',
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        posts: [moderationPost],
      });
      const updated = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
        posts: [moderationPost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.updateGigCandidateDraft.mockResolvedValue(
        updated,
      );
      telegramServiceMock.editGigCandidatePost.mockResolvedValue({
        kind: PostEditKind.Media,
        message: {
          message_id: moderationPost.id,
          date: 1_700_000_002,
          chat: { id: moderationPost.chatId, type: 'channel' },
        },
      });
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(
        service.updateGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'Updated title',
          },
          posterFile: {
            buffer: Buffer.from('updated poster'),
            filename: 'poster.jpg',
          },
        }),
      ).resolves.toEqual(updated);
      expect(
        gigCandidateRepositoryMock.updateGigCandidateModerationPostFileId,
      ).not.toHaveBeenCalled();
    });

    it('should return version conflict before a stale draft update', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);

      await expect(
        service.updateGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 1,
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'Stale title',
          },
        }),
      ).rejects.toMatchObject({
        name: GigCandidateConflictError.name,
        command: GigCandidateCommand.UpdateDraft,
        reason: 'versionConflict',
      });
      expect(
        gigCandidateRepositoryMock.updateGigCandidateDraft,
      ).not.toHaveBeenCalled();
    });

    it('should return explicit conflict when a conditional draft update loses a race', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.updateGigCandidateDraft.mockResolvedValue(
        null,
      );

      await expect(
        service.updateGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigDraft: {
            communityIds: ['507f1f77bcf86cd799439011'],
            title: 'Updated title',
          },
        }),
      ).rejects.toMatchObject({
        name: GigCandidateConflictError.name,
        command: GigCandidateCommand.UpdateDraft,
        reason: 'concurrentModification',
      });
    });
  });
});

interface GigCandidateOverrides extends Omit<
  Partial<GigCandidate>,
  'gigDraft'
> {
  gigDraft?: Partial<GigCandidate['gigDraft']>;
}

function buildGigCandidate(
  overrides: GigCandidateOverrides = {},
): GigCandidate {
  const gigDraft = {
    communityIds: ['507f1f77bcf86cd799439011'],
    ...overrides.gigDraft,
  };
  return {
    id: '507f1f77bcf86cd799439099',
    source: {
      type: GigSourceType.User,
      userId: '507f1f77bcf86cd799439088',
      origin: { type: GigSourceUserOriginType.Form },
    },
    version: 0,
    status: GigCandidateStatus.New,
    posts: [],
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    ...overrides,
    gigDraft,
  };
}

function buildGigApprovalResult(
  overrides: Partial<GigApprovalResult> = {},
): GigApprovalResult {
  return {
    id: '507f1f77bcf86cd799439011',
    communityIds: ['507f1f77bcf86cd799439011'],
    publicId: 'radiohead-2026-06-12',
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    city: 'Barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    source: {
      type: GigSourceType.User,
      origin: {
        type: GigSourceUserOriginType.Messenger,
        messenger: Messenger.Telegram,
      },
    },
    version: 0,
    isVisible: true,
    ...overrides,
  };
}
