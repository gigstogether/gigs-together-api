import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigCandidatePostType } from '../gig-candidate/types/gig-candidate-post-type.enum';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate/gig-candidate-list-sort';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import { GigService } from '../gig/gig.service';
import { Messenger } from '../../shared/types/messenger.enum';
import { TelegramService } from '../telegram/telegram.service';
import { AdminGigCandidateService } from './admin-gig-candidate.service';

function buildRecord(overrides: Partial<GigCandidate> = {}): GigCandidate {
  return {
    id: '507f1f77bcf86cd799439099',
    source: {
      type: 'user',
      userId: '66a000000000000000000000042',
      origin: { type: 'form' },
    },
    gigDraft: {
      title: 'Band',
      date: Date.parse('2026-08-20T00:00:00.000Z'),
      city: 'Barcelona',
      country: 'ES',
      venue: 'Razzmatazz',
      ticketsUrl: 'https://example.com/tickets',
      poster: { bucketPath: 'gigs/poster' },
    },
    version: 0,
    status: GigCandidateStatus.Pending,
    posts: [],
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    ...overrides,
  };
}

describe('AdminGigCandidateService', () => {
  let service: AdminGigCandidateService;

  const gigCandidateServiceMock = {
    findMany: vi.fn(),
    getByIdOrThrow: vi.fn(),
  };
  const gigServiceMock = {
    getGigById: vi.fn(),
    resolveGigPosterPublicUrl: vi.fn(),
  };
  const telegramServiceMock = {
    getPostUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGigCandidateService,
        { provide: GigCandidateService, useValue: gigCandidateServiceMock },
        { provide: GigService, useValue: gigServiceMock },
        { provide: TelegramService, useValue: telegramServiceMock },
      ],
    }).compile();

    service = module.get(AdminGigCandidateService);
  });

  describe('getList', () => {
    it('should return resolved candidates for the requested status and sorting', async () => {
      const record = buildRecord();
      gigCandidateServiceMock.findMany.mockResolvedValue([record]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );

      await expect(
        service.getList({
          status: GigCandidateStatus.Pending,
          limit: 20,
          sortBy: AdminGigCandidateListSortBy.EventDate,
          sortOrder: AdminGigCandidateListSortOrder.Asc,
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: record.id,
          gigDraft: record.gigDraft,
          posterUrl: 'https://cdn.example/poster.jpg',
          createdAt: record.createdAt,
        }),
      ]);
      expect(gigCandidateServiceMock.findMany).toHaveBeenCalledWith({
        status: GigCandidateStatus.Pending,
        limit: 20,
        sortBy: AdminGigCandidateListSortBy.EventDate,
        sortOrder: AdminGigCandidateListSortOrder.Asc,
      });
    });
  });

  describe('getById', () => {
    it('should include candidate post and linked gig URLs', async () => {
      const record = buildRecord({
        status: GigCandidateStatus.Approved,
        gigId: '507f1f77bcf86cd799439011',
        posts: [
          {
            to: Messenger.Telegram,
            type: GigCandidatePostType.Suggestion,
            date: 1_700_000_000_000,
            id: 77,
            chatId: -100123,
          },
        ],
      });
      gigCandidateServiceMock.getByIdOrThrow.mockResolvedValue(record);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.getGigById.mockResolvedValue({ publicId: 'band-2026' });
      telegramServiceMock.getPostUrl.mockReturnValue('https://t.me/c/123/77');

      await expect(service.getById(record.id)).resolves.toEqual(
        expect.objectContaining({
          postUrl: 'https://t.me/c/123/77',
          postDate: 1_700_000_000_000,
          linkedGigPublicId: 'band-2026',
        }),
      );
      expect(gigServiceMock.getGigById).toHaveBeenCalledWith(record.gigId);
    });
  });
});
