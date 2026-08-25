import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GigPosterService } from '../gig/gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { AiService } from '../ai/ai.service';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import {
  GigCandidateCommand,
  GigCandidateConflictError,
} from './gig-candidate-state-machine';
import { GigCandidateService } from './gig-candidate.service';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type { GigCandidate } from './types/gig-candidate.types';

describe('GigCandidateService', () => {
  let service: GigCandidateService;

  const gigCandidateRepositoryMock: {
    createId: ReturnType<typeof vi.fn>;
    createGigCandidate: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    appendGigCandidatePost: ReturnType<typeof vi.fn>;
    sendGigCandidateToModeration: ReturnType<typeof vi.fn>;
    rejectGigCandidate: ReturnType<typeof vi.fn>;
    updateGigCandidateDraft: ReturnType<typeof vi.fn>;
  } = {
    createId: vi.fn(),
    createGigCandidate: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    appendGigCandidatePost: vi.fn(),
    sendGigCandidateToModeration: vi.fn(),
    rejectGigCandidate: vi.fn(),
    updateGigCandidateDraft: vi.fn(),
  };

  const gigPosterServiceMock = {
    upload: vi.fn(),
  };

  const telegramServiceMock = {
    sendGigCandidateToSuggestion: vi.fn(),
  };

  const aiServiceMock = {
    lookupGigV1: vi.fn(),
  };

  beforeEach(async () => {
    vi.stubEnv('DEFAULT_GIG_POSTER_URL', 'https://cdn.example/default.jpg');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidateService,
        {
          provide: GIG_CANDIDATE_REPOSITORY,
          useValue: gigCandidateRepositoryMock,
        },
        { provide: GigPosterService, useValue: gigPosterServiceMock },
        { provide: TelegramService, useValue: telegramServiceMock },
        { provide: AiService, useValue: aiServiceMock },
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
        status: GigCandidateStatus.Pending,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue(created.gigDraft.poster);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateToSuggestion.mockResolvedValue(
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
          status: GigCandidateStatus.Pending,
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
        telegramServiceMock.sendGigCandidateToSuggestion,
      ).toHaveBeenCalledWith(created);
    });

    it('should append suggestion post when Telegram returns a message', async () => {
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
        status: GigCandidateStatus.Pending,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue(created.gigDraft.poster);
      gigCandidateRepositoryMock.createGigCandidate.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateToSuggestion.mockResolvedValue({
        message_id: 55,
        date: 1_700_000_000,
        chat: { id: -200 },
        photo: [{ file_id: 'photo-1', width: 1, height: 1 }],
      });
      gigCandidateRepositoryMock.appendGigCandidatePost.mockResolvedValue({
        ...created,
        version: 1,
      });

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
        gigCandidateRepositoryMock.appendGigCandidatePost,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          gigCandidateId: created.id,
          expectedVersion: 0,
          post: expect.objectContaining({
            id: 55,
            chatId: -200,
            fileId: 'photo-1',
          }),
        }),
      );
    });
  });

  describe('getByIdOrThrow', () => {
    it('should throw NotFoundException when GigCandidate does not exist', async () => {
      gigCandidateRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.getByIdOrThrow('507f1f77bcf86cd799439099'),
      ).rejects.toThrow(/Gig Candidate with ID/);
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
        telegramServiceMock.sendGigCandidateToSuggestion,
      ).not.toHaveBeenCalled();
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
    it('should conditionally transition Pending to Reviewing', async () => {
      const pending = buildGigCandidate();
      const reviewing = {
        ...pending,
        status: GigCandidateStatus.Reviewing,
        version: 1,
      };
      gigCandidateRepositoryMock.findById.mockResolvedValue(pending);
      gigCandidateRepositoryMock.sendGigCandidateToModeration.mockResolvedValue(
        reviewing,
      );

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: pending.id,
          expectedVersion: 0,
        }),
      ).resolves.toEqual(reviewing);
      expect(
        gigCandidateRepositoryMock.sendGigCandidateToModeration,
      ).toHaveBeenCalledWith({
        gigCandidateId: pending.id,
        expectedVersion: 0,
      });
    });

    it('should return Reviewing GigCandidate for an idempotent retry', async () => {
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 2,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(reviewing);

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: reviewing.id,
          expectedVersion: 0,
        }),
      ).resolves.toEqual(reviewing);
      expect(
        gigCandidateRepositoryMock.sendGigCandidateToModeration,
      ).not.toHaveBeenCalled();
    });

    it('should return concurrent Reviewing transition as an idempotent retry', async () => {
      const pending = buildGigCandidate();
      const reviewing = buildGigCandidate({
        status: GigCandidateStatus.Reviewing,
        version: 1,
      });
      gigCandidateRepositoryMock.findById
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(reviewing);
      gigCandidateRepositoryMock.sendGigCandidateToModeration.mockResolvedValue(
        null,
      );

      await expect(
        service.sendGigCandidateToModeration({
          gigCandidateId: pending.id,
          expectedVersion: 0,
        }),
      ).resolves.toEqual(reviewing);
    });
  });

  describe('rejectGigCandidate', () => {
    it('should conditionally reject Pending GigCandidate with audit fields', async () => {
      const pending = buildGigCandidate();
      const rejectedByUserId = '507f1f77bcf86cd799439077';
      const rejected = buildGigCandidate({
        status: GigCandidateStatus.Rejected,
        version: 1,
        rejectedAt: new Date('2026-08-24T12:00:00.000Z'),
        rejectedByUserId,
      });
      gigCandidateRepositoryMock.findById.mockResolvedValue(pending);
      gigCandidateRepositoryMock.rejectGigCandidate.mockResolvedValue(rejected);

      await expect(
        service.rejectGigCandidate({
          gigCandidateId: pending.id,
          expectedVersion: 0,
          rejectedByUserId,
        }),
      ).resolves.toEqual(rejected);
      expect(
        gigCandidateRepositoryMock.rejectGigCandidate,
      ).toHaveBeenCalledWith({
        gigCandidateId: pending.id,
        expectedVersion: 0,
        rejectedByUserId: rejected.rejectedByUserId,
        rejectedAt: expect.any(Date),
      });
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
    status: GigCandidateStatus.Pending,
    posts: [],
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    ...overrides,
  };
}
