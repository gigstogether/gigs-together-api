import { GigCandidateSource } from './types/gig-candidate-source.enum';
import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GigPosterService } from '../gig/gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import { GigCandidateService } from './gig-candidate.service';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type { GigCandidateRecord } from './types/gig-candidate.types';

describe('GigCandidateService', () => {
  let service: GigCandidateService;

  const gigCandidateRepositoryMock: {
    createId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    appendSuggestionPost: ReturnType<typeof vi.fn>;
    markAccepted: ReturnType<typeof vi.fn>;
    markRejected: ReturnType<typeof vi.fn>;
  } = {
    createId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    appendSuggestionPost: vi.fn(),
    markAccepted: vi.fn(),
    markRejected: vi.fn(),
  };

  const gigPosterServiceMock = {
    upload: vi.fn(),
  };

  const telegramServiceMock = {
    sendGigCandidateToSuggestion: vi.fn(),
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
            tgUser: { id: 1, first_name: 'A' },
            isAdmin: false,
          },
          posterFile: undefined,
        }),
      ).rejects.toThrow(/ticketsUrl must be a valid URL/);
    });

    it('should create GigCandidate and return id when required fields are valid', async () => {
      const created: GigCandidateRecord = {
        id: '507f1f77bcf86cd799439099',
        source: GigCandidateSource.User,
        title: 'Band',
        date: Date.parse('2026-08-01T00:00:00.000Z'),
        city: 'Barcelona',
        country: 'ES',
        status: GigCandidateStatus.Pending,
        posts: [],
        suggestedBy: { userId: 99, username: 'fan', name: 'Fan User' },
        poster: { bucketPath: 'gigs/2026/es/barcelona/gc-1' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue(created.poster);
      gigCandidateRepositoryMock.create.mockResolvedValue(created);
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

      expect(gigCandidateRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: created.id,
          title: 'Band',
          country: 'ES',
          suggestedBy: {
            userId: 99,
            username: 'fan',
            name: 'Fan User',
          },
        }),
      );
      expect(result).toEqual({ id: created.id });
      expect(
        telegramServiceMock.sendGigCandidateToSuggestion,
      ).toHaveBeenCalledWith(created);
    });

    it('should append suggestion post when Telegram returns a message', async () => {
      const created: GigCandidateRecord = {
        id: '507f1f77bcf86cd799439099',
        source: GigCandidateSource.User,
        title: 'Band',
        date: Date.parse('2026-08-01T00:00:00.000Z'),
        city: 'Barcelona',
        country: 'ES',
        status: GigCandidateStatus.Pending,
        posts: [],
        suggestedBy: { userId: 1, name: 'A' },
        poster: { bucketPath: 'gigs/ug' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      gigCandidateRepositoryMock.createId.mockReturnValue(created.id);
      gigPosterServiceMock.upload.mockResolvedValue(created.poster);
      gigCandidateRepositoryMock.create.mockResolvedValue(created);
      telegramServiceMock.sendGigCandidateToSuggestion.mockResolvedValue({
        message_id: 55,
        date: 1_700_000_000,
        chat: { id: -200 },
        photo: [{ file_id: 'photo-1', width: 1, height: 1 }],
      });
      gigCandidateRepositoryMock.appendSuggestionPost.mockResolvedValue(
        created,
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
          tgUser: { id: 1, first_name: 'A' },
          isAdmin: false,
        },
        posterFile: undefined,
      });

      expect(
        gigCandidateRepositoryMock.appendSuggestionPost,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          id: created.id,
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
      ).rejects.toThrow(/GigCandidate with ID/);
    });
  });

  describe('markAccepted', () => {
    it('should throw NotFoundException when repository returns null', async () => {
      gigCandidateRepositoryMock.markAccepted.mockResolvedValue(null);

      await expect(
        service.markAccepted({
          id: '507f1f77bcf86cd799439099',
          gigId: '507f1f77bcf86cd799439011',
        }),
      ).rejects.toThrow(/GigCandidate with ID/);
    });
  });

  describe('markRejected', () => {
    it('should throw NotFoundException when repository returns null', async () => {
      gigCandidateRepositoryMock.markRejected.mockResolvedValue(null);

      await expect(
        service.markRejected({ id: '507f1f77bcf86cd799439099' }),
      ).rejects.toThrow(/GigCandidate with ID/);
    });
  });
});
