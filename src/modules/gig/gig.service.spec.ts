import { BadRequestException, ConflictException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { BucketService } from '../bucket/bucket.service';
import { CalendarService } from '../calendar/calendar.service';
import { TelegramService } from '../telegram/telegram.service';
import { GigPosterService } from './gig.poster.service';
import { GigService } from './gig.service';
import { GIG_REPOSITORY } from './repositories/gig.repository';
import type { GigRepository } from './repositories/gig.repository';
import {
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from './types/admin-gig-list-sort.types';
import type { PlainGig } from './types/gig.types';

function buildGig(overrides: Partial<PlainGig> = {}): PlainGig {
  return {
    id: '507f1f77bcf86cd799439011',
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    isVisible: true,
    version: 3,
    source: {
      type: 'user',
      userId: '507f1f77bcf86cd799439012',
      origin: { type: 'admin' },
    },
    posts: [],
    createdAt: new Date('2026-05-30T14:22:00.000Z'),
    updatedAt: new Date('2026-05-30T14:22:00.000Z'),
    ...overrides,
  };
}

describe('GigService', () => {
  let service: GigService;

  const gigRepository: Record<keyof GigRepository, ReturnType<typeof vi.fn>> = {
    existsByPublicId: vi.fn(),
    isPublicIdTaken: vi.fn(),
    countAll: vi.fn(),
    countVisible: vi.fn(),
    findMany: vi.fn(),
    findByPublicId: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    updateByPublicId: vi.fn(),
    updateVisibility: vi.fn(),
    appendMainPost: vi.fn(),
    updateTelegramPostFileId: vi.fn(),
    findVisibleInRange: vi.fn(),
    findVisiblePage: vi.fn(),
    findVisibleDateByPublicId: vi.fn(),
    findVisibleAround: vi.fn(),
    findVisibleDates: vi.fn(),
  };
  const uploadPoster = vi.fn();
  const pickTgPost = vi.fn();
  const getCreateCalendarEventUrl = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    gigRepository.isPublicIdTaken.mockResolvedValue(false);
    gigRepository.findMany.mockResolvedValue([]);
    gigRepository.findVisibleInRange.mockResolvedValue([]);
    gigRepository.findVisiblePage.mockResolvedValue({
      gigs: [],
      hasMore: false,
    });
    gigRepository.findVisibleAround.mockResolvedValue({
      before: [],
      after: [],
      hasPrevious: false,
      hasNext: false,
    });
    gigRepository.findVisibleDates.mockResolvedValue([]);
    uploadPoster.mockResolvedValue(undefined);
    pickTgPost.mockReturnValue(undefined);
    getCreateCalendarEventUrl.mockReturnValue('https://calendar.example/event');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigService,
        { provide: GIG_REPOSITORY, useValue: gigRepository },
        {
          provide: CalendarService,
          useValue: { getCreateCalendarEventUrl },
        },
        { provide: GigPosterService, useValue: { upload: uploadPoster } },
        { provide: TelegramService, useValue: { pickTgPost } },
        { provide: BucketService, useValue: { getPublicFileUrl: vi.fn() } },
      ],
    }).compile();

    service = module.get(GigService);
  });

  describe('generateUniquePublicId', () => {
    it('should use the repository uniqueness check by default', async () => {
      await expect(
        service.generateUniquePublicId({
          title: 'Radiohead',
          yyyyMmDd: '2026-06-12',
        }),
      ).resolves.toBe('radiohead-2026-06-12');

      expect(gigRepository.isPublicIdTaken).toHaveBeenCalledWith({
        publicId: 'radiohead-2026-06-12',
      });
    });

    it('should use the supplied transaction-aware uniqueness check', async () => {
      const isPublicIdTaken = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(
        service.generateUniquePublicId({
          title: 'Beyoncé & Friends',
          yyyyMmDd: '2026-06-12',
          isPublicIdTaken,
        }),
      ).resolves.toBe('beyonce-friends-2026-06-12-2');

      expect(isPublicIdTaken).toHaveBeenNthCalledWith(
        2,
        'beyonce-friends-2026-06-12-2',
      );
      expect(gigRepository.isPublicIdTaken).not.toHaveBeenCalled();
    });
  });

  describe('getGigs', () => {
    it('should delegate bounded sorting to the repository', async () => {
      await service.getGigs({
        limit: 1_000,
        sortBy: AdminGigListSortBy.EventDate,
        sortOrder: AdminGigListSortOrder.Asc,
      });

      expect(gigRepository.findMany).toHaveBeenCalledWith({
        limit: 100,
        sortBy: AdminGigListSortBy.EventDate,
        sortOrder: AdminGigListSortOrder.Asc,
      });
    });

    it('should reject an unsupported sort before querying the repository', () => {
      expect(() =>
        service.getGigs({
          limit: 10,
          sortBy: 'unknown' as AdminGigListSortBy,
        }),
      ).toThrow(BadRequestException);
      expect(gigRepository.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getGigsByIds', () => {
    it('should preserve unique input order', async () => {
      const first = buildGig();
      const second = buildGig({
        id: '507f1f77bcf86cd799439013',
        publicId: 'second-2026-06-13',
      });
      gigRepository.findByIds.mockResolvedValue([second, first]);

      await expect(
        service.getGigsByIds([first.id, second.id, first.id]),
      ).resolves.toEqual([first, second]);
      expect(gigRepository.findByIds).toHaveBeenCalledWith([
        first.id,
        second.id,
      ]);
    });

    it('should reject invalid IDs before querying the repository', async () => {
      await expect(service.getGigsByIds(['invalid'])).rejects.toThrow(
        BadRequestException,
      );
      expect(gigRepository.findByIds).not.toHaveBeenCalled();
    });

    it('should reject missing linked Gigs', async () => {
      const gig = buildGig();
      gigRepository.findByIds.mockResolvedValue([]);

      await expect(service.getGigsByIds([gig.id])).rejects.toMatchObject({
        message: `Gigs with IDs ${gig.id} not found`,
      });
    });
  });

  describe('updateGigByPublicId', () => {
    const gigInput = {
      title: 'Radiohead',
      date: '2026-06-12',
      city: 'barcelona',
      country: 'ES',
      venue: 'Palau Sant Jordi',
      ticketsUrl: 'https://tickets.example/radiohead',
    };

    it('should delegate an optimistic update to the repository', async () => {
      const updated = buildGig({ version: 4 });
      gigRepository.updateByPublicId.mockResolvedValue(updated);

      await expect(
        service.updateGigByPublicId({
          publicId: updated.publicId,
          expectedVersion: 3,
          gig: gigInput,
          posterFile: undefined,
        }),
      ).resolves.toBe(updated);
      expect(gigRepository.updateByPublicId).toHaveBeenCalledWith({
        publicId: updated.publicId,
        expectedVersion: 3,
        title: gigInput.title,
        date: new Date(gigInput.date).getTime(),
        city: gigInput.city,
        country: gigInput.country,
        venue: gigInput.venue,
        ticketsUrl: gigInput.ticketsUrl,
      });
    });

    it('should distinguish stale versions from missing Gigs', async () => {
      gigRepository.updateByPublicId.mockResolvedValue(null);
      gigRepository.existsByPublicId.mockResolvedValue(true);

      await expect(
        service.updateGigByPublicId({
          publicId: 'radiohead-2026-06-12',
          expectedVersion: 2,
          gig: gigInput,
          posterFile: undefined,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('appendGigMainPost', () => {
    it('should add Telegram ownership fields before persisting the post', async () => {
      const updated = buildGig({ version: 4 });
      gigRepository.appendMainPost.mockResolvedValue(updated);

      await service.appendGigMainPost({
        gigId: updated.id,
        expectedVersion: 3,
        post: { id: 42, chatId: -1001, date: 1_789_603_300_000 },
      });

      expect(gigRepository.appendMainPost).toHaveBeenCalledWith({
        gigId: updated.id,
        expectedVersion: 3,
        post: {
          id: 42,
          chatId: -1001,
          date: 1_789_603_300_000,
          to: Messenger.Telegram,
          type: PostType.Main,
        },
      });
    });

    it('should report an existing Main post after a concurrent write', async () => {
      const gig = buildGig();
      gigRepository.appendMainPost.mockResolvedValue(null);
      gigRepository.findById.mockResolvedValue(gig);
      pickTgPost.mockReturnValue({ id: 42 });

      await expect(
        service.appendGigMainPost({
          gigId: gig.id,
          expectedVersion: gig.version,
          post: { id: 42, chatId: -1001, date: 1_789_603_300_000 },
        }),
      ).rejects.toMatchObject({ message: 'Gig main post already exists' });
    });
  });

  describe('updateGigTelegramPostFileId', () => {
    it('should delegate an exact transport metadata update', async () => {
      const params = {
        gigId: '507f1f77bcf86cd799439011',
        expectedVersion: 4,
        type: PostType.Moderation,
        messageId: 42,
        chatId: -100123,
        fileId: 'new-file-id',
      };
      gigRepository.updateTelegramPostFileId.mockResolvedValue(buildGig());

      await service.updateGigTelegramPostFileId(params);

      expect(gigRepository.updateTelegramPostFileId).toHaveBeenCalledWith(
        params,
      );
    });

    it('should reject an empty Telegram file ID before writing', () => {
      expect(() =>
        service.updateGigTelegramPostFileId({
          gigId: '507f1f77bcf86cd799439011',
          expectedVersion: 4,
          type: PostType.Main,
          messageId: 99,
          chatId: -100456,
          fileId: ' ',
        }),
      ).toThrow('Telegram file ID must not be empty');
      expect(gigRepository.updateTelegramPostFileId).not.toHaveBeenCalled();
    });
  });

  describe('public Gig queries', () => {
    it('should delegate inclusive digest date bounds', async () => {
      await service.getVisibleGigsInInclusiveMsRange({ fromMs: 10, toMs: 20 });

      expect(gigRepository.findVisibleInRange).toHaveBeenCalledWith({
        from: 10,
        to: 20,
      });
    });

    it('should omit domain source from the public feed response', async () => {
      const gig = buildGig();
      gigRepository.findVisiblePage.mockResolvedValue({
        gigs: [gig],
        hasMore: false,
      });

      const result = await service.getVisibleGigsV1({
        from: gig.date,
        limit: 10,
        city: 'barcelona',
        country: 'ES',
      });

      expect(result.gigs[0]).not.toHaveProperty('source');
      expect(gigRepository.findVisiblePage).toHaveBeenCalledWith({
        from: gig.date,
        city: 'barcelona',
        country: 'ES',
        limit: 10,
        direction: 'next',
      });
    });

    it('should return repository dates as serialized values', async () => {
      gigRepository.findVisibleDates.mockResolvedValue([10, 20]);

      await expect(
        service.getVisibleGigDatesV1({
          from: 1,
          to: 30,
          city: 'barcelona',
          country: 'ES',
        }),
      ).resolves.toEqual({ dates: ['10', '20'] });
    });
  });
});
