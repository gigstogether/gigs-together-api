import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GigPosterService } from '../gig/gig.poster.service';
import { PostType } from '../../shared/types/post-type.enum';
import { TelegramService } from '../telegram/telegram.service';
import { Messenger } from '../../shared/types/messenger.enum';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { FeedRevalidateService } from '../gig/feed-revalidate.service';
import { GigService } from '../gig/gig.service';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from './repositories/gig-candidate-approval.repository';
import {
  GigCandidateCommand,
  GigCandidateConflictError,
} from './gig-candidate-state-machine';
import { GigCandidateService } from './gig-candidate.service';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type { GigCandidate } from './types/gig-candidate.types';
import { GigCandidateApprovalValidationError } from './gig-candidate-approval';
import type { GigApprovalResult } from './repositories/gig-candidate-approval.repository';

describe('GigCandidateService', () => {
  let service: GigCandidateService;

  const gigCandidateRepositoryMock: {
    createId: ReturnType<typeof vi.fn>;
    createGigCandidate: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    appendGigCandidatePostIfAbsent: ReturnType<typeof vi.fn>;
    sendGigCandidateToModeration: ReturnType<typeof vi.fn>;
    rejectGigCandidate: ReturnType<typeof vi.fn>;
    updateGigCandidateDraft: ReturnType<typeof vi.fn>;
  } = {
    createId: vi.fn(),
    createGigCandidate: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    appendGigCandidatePostIfAbsent: vi.fn(),
    sendGigCandidateToModeration: vi.fn(),
    rejectGigCandidate: vi.fn(),
    updateGigCandidateDraft: vi.fn(),
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
    removeGigCandidateIntakeActions: vi.fn(),
    sendGigCandidateFeedback: vi.fn(),
    updateRejectedGigCandidatePost: vi.fn(),
    updateGigModerationPost: vi.fn(),
  };

  const userServiceMock = {
    findActiveUserById: vi.fn(),
  };

  const aiServiceMock = {
    lookupGigV1: vi.fn(),
  };

  const calendarServiceMock = { addEvent: vi.fn() };
  const feedRevalidateServiceMock = { revalidateFeedOrThrow: vi.fn() };
  const gigServiceMock = {
    generateUniquePublicId: vi.fn(),
    gigToCalendarPayload: vi.fn(),
  };

  beforeEach(async () => {
    vi.stubEnv('DEFAULT_GIG_POSTER_URL', 'https://cdn.example/default.jpg');
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidateService,
        {
          provide: GIG_CANDIDATE_REPOSITORY,
          useValue: gigCandidateRepositoryMock,
        },
        {
          provide: GIG_CANDIDATE_APPROVAL_REPOSITORY,
          useValue: gigCandidateApprovalRepositoryMock,
        },
        { provide: GigPosterService, useValue: gigPosterServiceMock },
        { provide: TelegramService, useValue: telegramServiceMock },
        { provide: AiService, useValue: aiServiceMock },
        { provide: CalendarService, useValue: calendarServiceMock },
        { provide: FeedRevalidateService, useValue: feedRevalidateServiceMock },
        { provide: GigService, useValue: gigServiceMock },
        { provide: UserService, useValue: userServiceMock },
      ],
    }).compile();

    service = module.get(GigCandidateService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('handleSubmit', () => {
    it('should throw BadRequestException when title is missing', async () => {
      await expect(
        service.handleSubmit({
          body: {
            gig: {
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

    it('should create GigCandidate and return id when required fields are valid', async () => {
      const created: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000099',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Band',
          date: Date.parse('2026-08-01T00:00:00.000Z'),
          city: 'Barcelona',
          country: 'ES',
          poster: { bucketPath: 'gigs/2026/es/barcelona/gc-1' },
        },
        version: 0,
        status: GigCandidateStatus.New,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue(created.gigDraft.poster);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateIntakePost.mockResolvedValue(
        undefined,
      );

      const result = await service.handleSubmit({
        body: {
          gig: {
            title: 'Band',
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
            type: 'user',
            userId: '66a000000000000000000000099',
            origin: { type: 'form' },
          },
          gigDraft: expect.objectContaining({
            title: 'Band',
            country: 'ES',
          }),
        }),
      );
      expect(result).toEqual({ id: created.id });
      expect(
        telegramServiceMock.sendGigCandidateIntakePost,
      ).toHaveBeenCalledWith(created);
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        { kind: 'submitted', chatId: '42' },
      );
    });

    it('should append Intake post when Telegram returns a message', async () => {
      const created: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000001',
          origin: { type: 'form' },
        },
        gigDraft: {
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
      gigPosterServiceMock.upload.mockResolvedValue(created.gigDraft.poster);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateIntakePost.mockResolvedValue({
        message_id: 55,
        date: 1_700_000_000,
        chat: { id: -200 },
        photo: [{ file_id: 'photo-1', width: 1, height: 1 }],
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

    it('should keep submission successful when no active Telegram recipient exists', async () => {
      const created = buildGigCandidate({
        source: {
          type: 'user',
          userId: '66a000000000000000000000001',
          origin: { type: 'form' },
        },
        gigDraft: {
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
      userServiceMock.findActiveUserById.mockResolvedValue(null);

      await expect(
        service.handleSubmit({
          body: {
            gig: {
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
          type: 'user',
          userId,
          origin: { type: 'admin' },
        },
        gigDraft: { title: 'Band' },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(gigCandidateId);
      gigPosterServiceMock.upload.mockResolvedValue(undefined);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue(
        undefined,
      );

      await expect(
        service.createAdminGigCandidate({
          userId,
          gigDraft: { title: 'Band' },
        }),
      ).resolves.toEqual(created);
      expect(
        gigCandidateRepositoryMock.createGigCandidate,
      ).toHaveBeenCalledWith({
        gigCandidateId,
        status: GigCandidateStatus.Reviewing,
        source: {
          type: 'user',
          userId,
          origin: { type: 'admin' },
        },
        gigDraft: { title: 'Band' },
      });
      expect(
        telegramServiceMock.sendGigCandidateIntakePost,
      ).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateModerationPost,
      ).toHaveBeenCalledWith(created);
    });

    it('should send admin lifecycle feedback only when enabled', async () => {
      const created = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        gigDraft: { title: 'Band' },
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439088',
          origin: { type: 'admin' },
        },
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
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
        gigDraft: {},
      });
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
      expect(userServiceMock.findActiveUserById).not.toHaveBeenCalled();

      vi.stubEnv('SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS', 'true');
      await service.createAdminGigCandidate({
        userId: '507f1f77bcf86cd799439088',
        gigDraft: {},
      });
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        { kind: 'acceptedForModeration', title: 'Band', chatId: '42' },
      );
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).toHaveBeenCalledTimes(1);
      expect(userServiceMock.findActiveUserById).toHaveBeenCalledTimes(1);
    });

    it('should skip accepted-for-moderation feedback when the Gig title is missing', async () => {
      const created = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439088',
          origin: { type: 'admin' },
        },
        gigDraft: {},
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue(
        undefined,
      );
      vi.stubEnv('SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS', 'true');

      await service.createAdminGigCandidate({
        userId: '507f1f77bcf86cd799439088',
        gigDraft: {},
      });

      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
      expect(userServiceMock.findActiveUserById).not.toHaveBeenCalled();
    });

    it('should store a direct Moderation post for an admin-created GigCandidate', async () => {
      const created = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439088',
          origin: { type: 'admin' },
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
          },
        ],
      });
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue({
        message_id: 50,
        date: 1_700_000_001,
        chat: { id: -200 },
      });
      gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent.mockResolvedValue(
        stored,
      );

      await expect(
        service.createAdminGigCandidate({
          userId: '507f1f77bcf86cd799439088',
          gigDraft: {},
        }),
      ).resolves.toEqual(stored);
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
        gigDraft: { title: 'Old title', poster },
      });
      const updated = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
        gigDraft: { title: 'New title', poster },
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.updateGigCandidateDraft.mockResolvedValue(
        updated,
      );

      await expect(
        service.updateAdminGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigDraft: { title: 'New title' },
        }),
      ).resolves.toEqual(updated);
      expect(
        gigCandidateRepositoryMock.updateGigCandidateDraft,
      ).toHaveBeenCalledWith({
        gigCandidateId: reviewing.id,
        expectedVersion: 0,
        gigDraft: { title: 'New title', poster },
      });
      expect(gigPosterServiceMock.upload).not.toHaveBeenCalled();
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
      aiServiceMock.lookupGigV1.mockResolvedValue(lookupResult);

      await expect(
        service.lookupGigCandidateDraft({
          title: 'Band',
          location: 'Barcelona, ES',
        }),
      ).resolves.toEqual(lookupResult);
      expect(aiServiceMock.lookupGigV1).toHaveBeenCalledWith({
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
    it('should transition once, store Moderation, and then remove Intake actions', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const newGigCandidate = buildGigCandidate({
        gigDraft: { title: 'Band' },
        version: 1,
        posts: [intakePost],
      });
      const reviewing = buildGigCandidate({
        ...newGigCandidate,
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const stored = buildGigCandidate({
        ...reviewing,
        version: 3,
        posts: [intakePost, moderationPost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.sendGigCandidateToModeration.mockResolvedValue(
        reviewing,
      );
      telegramServiceMock.sendGigCandidateModerationPost.mockResolvedValue({
        message_id: moderationPost.id,
        date: 1_700_000_001,
        chat: { id: moderationPost.chatId },
      });
      gigCandidateRepositoryMock.appendGigCandidatePostIfAbsent.mockResolvedValue(
        stored,
      );
      telegramServiceMock.removeGigCandidateIntakeActions.mockResolvedValue(
        undefined,
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
        telegramServiceMock.removeGigCandidateIntakeActions,
      ).toHaveBeenCalledWith(intakePost);
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        { kind: 'acceptedForModeration', title: 'Band', chatId: '42' },
      );
    });

    it('should leave Reviewing with Intake retry actions when Telegram send fails', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const newGigCandidate = buildGigCandidate({
        version: 1,
        posts: [intakePost],
      });
      const reviewing = buildGigCandidate({
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
        telegramServiceMock.removeGigCandidateIntakeActions,
      ).not.toHaveBeenCalled();
    });

    it('should not transition a Reviewing GigCandidate twice on repeated callback', async () => {
      const reviewing = buildGigCandidate({
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
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const reviewing = buildGigCandidate({
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

    it('should retry only Intake action removal after its first failure', async () => {
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_000_000,
        id: 40,
        chatId: -100,
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 3,
        posts: [
          intakePost,
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            date: 1_700_000_001_000,
            id: 50,
            chatId: -200,
          },
        ],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      telegramServiceMock.removeGigCandidateIntakeActions
        .mockRejectedValueOnce(new Error('Telegram update failed'))
        .mockResolvedValueOnce(undefined);

      await service.sendGigCandidateToModeration({
        gigCandidateId: reviewing.id,
        expectedVersion: 1,
      });
      await service.sendGigCandidateToModeration({
        gigCandidateId: reviewing.id,
        expectedVersion: 1,
      });

      expect(
        telegramServiceMock.removeGigCandidateIntakeActions,
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
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439088',
          origin: {
            type: 'messenger',
            messenger: Messenger.Telegram,
          },
          originalText: 'Private intake text',
          attachments: [{ bucketPath: 'private/source.png' }],
        },
        gigDraft: {
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
        service.approveGigCandidate({
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
        }),
      );
      expect(approvalTransactionMock.createGig).toHaveBeenCalledWith({
        gigId: gig.id,
        publicId: gig.publicId,
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        poster: { bucketPath: 'posters/radiohead.jpg' },
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439088',
          origin: { type: 'messenger' },
        },
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
        feedRevalidateServiceMock.revalidateFeedOrThrow,
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
        title: gig.title,
        publicId: gig.publicId,
        moderationPost: { chatId: -200, messageId: 50 },
      });
      expect(telegramServiceMock.sendGigCandidateFeedback).toHaveBeenCalledWith(
        {
          kind: 'acceptedWithPublicLink',
          publicId: gig.publicId,
          title: gig.title,
          chatId: '42',
        },
      );
    });

    it('should abort before Gig allocation when expected version is stale', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);

      await expect(
        service.approveGigCandidate({
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
        gigDraft: { title: 'Incomplete' },
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);

      await expect(
        service.approveGigCandidate({
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
        service.approveGigCandidate({
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
        feedRevalidateServiceMock.revalidateFeedOrThrow,
      ).not.toHaveBeenCalled();
      expect(
        telegramServiceMock.sendGigCandidateFeedback,
      ).not.toHaveBeenCalled();
    });

    it('should skip submitter feedback for a provider-origin GigCandidate', async () => {
      const source: GigCandidate['source'] = {
        type: 'provider',
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
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
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
        service.approveGigCandidate({
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
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
        },
      });
      approvalTransactionMock.findGigCandidateById.mockResolvedValue(reviewing);
      approvalTransactionMock.createGigId.mockReturnValue(
        '507f1f77bcf86cd799439011',
      );
      approvalTransactionMock.isGigPublicIdTaken.mockResolvedValue(false);
      approvalTransactionMock.approveGigCandidate.mockResolvedValue(null);

      await expect(
        service.approveGigCandidate({
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
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
        },
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
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
      feedRevalidateServiceMock.revalidateFeedOrThrow.mockRejectedValue(
        new Error('Revalidation unavailable'),
      );
      calendarServiceMock.addEvent.mockRejectedValue(
        new Error('Calendar unavailable'),
      );
      telegramServiceMock.updateGigModerationPost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );

      await expect(
        service.approveGigCandidate({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          approvedByUserId: '507f1f77bcf86cd799439077',
        }),
      ).resolves.toEqual(gig);
      expect(calendarServiceMock.addEvent).toHaveBeenCalledOnce();
      expect(
        telegramServiceMock.updateGigModerationPost,
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
      const newGigCandidate = buildGigCandidate({ posts: [intakePost] });
      const rejectedByUserId = '507f1f77bcf86cd799439077';
      const rejected = buildGigCandidate({
        status: GigCandidateStatus.Rejected,
        version: 1,
        rejectedAt: new Date('2026-08-24T12:00:00.000Z'),
        rejectedByUserId,
        posts: [intakePost],
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(newGigCandidate);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);

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
        { kind: 'rejected', chatId: '42' },
      );
      expect(
        telegramServiceMock.updateRejectedGigCandidatePost,
      ).toHaveBeenCalledWith({ gigCandidate: rejected, post: intakePost });
    });

    it('should update the Moderation post after rejecting Reviewing and preserve the transition when Telegram fails', async () => {
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 50,
        chatId: -200,
      };
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        posts: [moderationPost],
      });
      const rejected = buildGigCandidate({
        status: GigCandidateStatus.Rejected,
        version: 1,
        posts: [moderationPost],
        rejectedAt: new Date(),
        rejectedByUserId: '507f1f77bcf86cd799439077',
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);
      telegramServiceMock.updateRejectedGigCandidatePost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );
      telegramServiceMock.sendGigCandidateFeedback.mockRejectedValue(
        new Error('Telegram unavailable'),
      );

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
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
      });
      const updated = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
        gigDraft: { title: 'Updated title' },
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);
      gigCandidateRepositoryMock.updateGigCandidateDraft.mockResolvedValue(
        updated,
      );

      await expect(
        service.updateGigCandidateDraft({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
          gigDraft: { title: 'Updated title' },
        }),
      ).resolves.toEqual(updated);
      expect(
        gigCandidateRepositoryMock.updateGigCandidateDraft,
      ).toHaveBeenCalledWith({
        gigCandidateId: reviewing.id,
        expectedVersion: 0,
        gigDraft: { title: 'Updated title' },
      });
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
          gigDraft: { title: 'Stale title' },
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
          gigDraft: { title: 'Updated title' },
        }),
      ).rejects.toMatchObject({
        name: GigCandidateConflictError.name,
        command: GigCandidateCommand.UpdateDraft,
        reason: 'concurrentModification',
      });
    });
  });
});

function buildGigCandidate(
  overrides: Partial<GigCandidate> = {},
): GigCandidate {
  return {
    id: '507f1f77bcf86cd799439099',
    source: {
      type: 'user',
      userId: '507f1f77bcf86cd799439088',
      origin: { type: 'form' },
    },
    gigDraft: {},
    version: 0,
    status: GigCandidateStatus.New,
    posts: [],
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    ...overrides,
  };
}

function buildGigApprovalResult(
  overrides: Partial<GigApprovalResult> = {},
): GigApprovalResult {
  return {
    id: '507f1f77bcf86cd799439011',
    publicId: 'radiohead-2026-06-12',
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    city: 'Barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    source: {
      type: 'user',
      userId: '507f1f77bcf86cd799439088',
      origin: { type: 'messenger' },
    },
    version: 0,
    isVisible: true,
    ...overrides,
  };
}
