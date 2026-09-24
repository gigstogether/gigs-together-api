import { Readable } from 'node:stream';

import { BadRequestException, ConflictException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { BucketService } from '../bucket/bucket.service';
import { TelegramService } from '../telegram/telegram.service';
import { PostEditKind } from '../telegram/types/telegram-post-composer.service.types';
import { FeedRevalidateService } from './feed-revalidate.service';
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
  const sendMainPost = vi.fn();
  const editGigPostsBestEffort = vi.fn();
  const updateGigModerationPost = vi.fn();
  const revalidateFeed = vi.fn();

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
    editGigPostsBestEffort.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigService,
        { provide: GIG_REPOSITORY, useValue: gigRepository },
        { provide: GigPosterService, useValue: { upload: uploadPoster } },
        {
          provide: TelegramService,
          useValue: {
            pickTgPost,
            sendMainPost,
            editGigPostsBestEffort,
            updateGigModerationPost,
          },
        },
        { provide: BucketService, useValue: { getPublicFileUrl: vi.fn() } },
        { provide: FeedRevalidateService, useValue: { revalidateFeed } },
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
      ).resolves.toEqual({ publicId: updated.publicId });
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

    it('should preserve the Gig update when Telegram reports no successful edits', async () => {
      const mainPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        chatId: -100123,
        id: 42,
        date: 1_700_000_001_000,
      };
      const updated = buildGig({ version: 4, posts: [mainPost] });
      gigRepository.updateByPublicId.mockResolvedValue(updated);
      editGigPostsBestEffort.mockResolvedValue({});

      await expect(
        service.updateGigByPublicId({
          publicId: updated.publicId,
          expectedVersion: 3,
          gig: gigInput,
          posterFile: undefined,
        }),
      ).resolves.toEqual({ publicId: updated.publicId });
      expect(revalidateFeed).toHaveBeenCalledWith({
        country: updated.country,
        city: updated.city,
      });
    });

    it('should edit Main and Moderation posts after updating a Gig', async () => {
      const mainPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        chatId: -100456,
        id: 99,
        date: 1_700_000_002_000,
      };
      const moderationPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        date: 1_700_000_001_000,
      };
      const updated = buildGig({
        title: 'Updated title',
        version: 4,
        posts: [moderationPost, mainPost],
      });
      gigRepository.updateByPublicId.mockResolvedValue(updated);

      await service.updateGigByPublicId({
        publicId: updated.publicId,
        expectedVersion: 3,
        gig: { ...gigInput, title: updated.title },
        posterFile: undefined,
      });

      expect(editGigPostsBestEffort).toHaveBeenCalledWith({
        gig: updated,
        isMediaUpdateRequired: false,
      });
    });

    it('should reuse the Moderation fileId when replacing both Telegram post posters', async () => {
      const mainPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        chatId: -100456,
        id: 99,
        fileId: 'old-file-id',
        date: 1_700_000_002_000,
      };
      const moderationPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        fileId: 'old-moderation-file-id',
        date: 1_700_000_001_000,
      };
      const updated = buildGig({
        version: 4,
        posts: [moderationPost, mainPost],
      });
      const updatedWithModerationFileId = buildGig({
        version: 4,
        posts: [
          { ...moderationPost, fileId: 'new-moderation-file-id' },
          mainPost,
        ],
      });
      const updatedWithBothFileIds = buildGig({
        version: 4,
        posts: [
          { ...moderationPost, fileId: 'new-moderation-file-id' },
          { ...mainPost, fileId: 'new-main-file-id' },
        ],
      });
      const posterBuffer = Buffer.from('new poster');
      const posterFile: Express.Multer.File = {
        fieldname: 'posterFile',
        originalname: 'poster.jpg',
        encoding: '7bit',
        buffer: posterBuffer,
        mimetype: 'image/jpeg',
        size: posterBuffer.length,
        stream: Readable.from(posterBuffer),
        destination: '',
        filename: '',
        path: '',
      };
      gigRepository.updateByPublicId.mockResolvedValue(updated);
      gigRepository.updateTelegramPostFileId
        .mockResolvedValueOnce(updatedWithModerationFileId)
        .mockResolvedValueOnce(updatedWithBothFileIds);
      editGigPostsBestEffort.mockResolvedValue({
        moderation: {
          post: moderationPost,
          result: {
            kind: PostEditKind.Media,
            message: {
              message_id: moderationPost.id,
              date: 1_700_000_003,
              chat: { id: moderationPost.chatId, type: 'channel' },
            },
            fileId: 'new-moderation-file-id',
          },
        },
        main: {
          post: mainPost,
          result: {
            kind: PostEditKind.Media,
            message: {
              message_id: mainPost.id,
              date: 1_700_000_004,
              chat: { id: mainPost.chatId, type: 'channel' },
            },
            fileId: 'new-main-file-id',
          },
        },
      });

      await service.updateGigByPublicId({
        publicId: updated.publicId,
        expectedVersion: 3,
        gig: gigInput,
        posterFile,
      });

      expect(editGigPostsBestEffort).toHaveBeenCalledWith({
        gig: updated,
        isMediaUpdateRequired: true,
      });
      expect(gigRepository.updateTelegramPostFileId).toHaveBeenNthCalledWith(
        1,
        {
          gigId: updated.id,
          expectedVersion: updated.version,
          type: PostType.Moderation,
          messageId: moderationPost.id,
          chatId: moderationPost.chatId,
          fileId: 'new-moderation-file-id',
        },
      );
      expect(gigRepository.updateTelegramPostFileId).toHaveBeenNthCalledWith(
        2,
        {
          gigId: updated.id,
          expectedVersion: updated.version,
          type: PostType.Main,
          messageId: mainPost.id,
          chatId: mainPost.chatId,
          fileId: 'new-main-file-id',
        },
      );
    });

    it('should store the Main fileId when only the Main Telegram edit succeeds', async () => {
      const moderationPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        fileId: 'old-moderation-file-id',
        date: 1_700_000_001_000,
      };
      const mainPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        chatId: -100456,
        id: 99,
        fileId: 'old-main-file-id',
        date: 1_700_000_002_000,
      };
      const updated = buildGig({
        version: 4,
        posts: [moderationPost, mainPost],
      });
      const updatedWithMainFileId = buildGig({
        version: 4,
        posts: [moderationPost, { ...mainPost, fileId: 'new-main-file-id' }],
      });
      const posterBuffer = Buffer.from('new poster');
      const posterFile: Express.Multer.File = {
        fieldname: 'posterFile',
        originalname: 'poster.jpg',
        encoding: '7bit',
        buffer: posterBuffer,
        mimetype: 'image/jpeg',
        size: posterBuffer.length,
        stream: Readable.from(posterBuffer),
        destination: '',
        filename: '',
        path: '',
      };
      gigRepository.updateByPublicId.mockResolvedValue(updated);
      gigRepository.updateTelegramPostFileId.mockResolvedValue(
        updatedWithMainFileId,
      );
      editGigPostsBestEffort.mockResolvedValue({
        main: {
          post: mainPost,
          result: {
            kind: PostEditKind.Media,
            message: {
              message_id: mainPost.id,
              date: 1_700_000_004,
              chat: { id: mainPost.chatId, type: 'channel' },
            },
            fileId: 'new-main-file-id',
          },
        },
      });

      await service.updateGigByPublicId({
        publicId: updated.publicId,
        expectedVersion: 3,
        gig: gigInput,
        posterFile,
      });

      expect(gigRepository.updateTelegramPostFileId).toHaveBeenCalledWith({
        gigId: updated.id,
        expectedVersion: updated.version,
        type: PostType.Main,
        messageId: mainPost.id,
        chatId: mainPost.chatId,
        fileId: 'new-main-file-id',
      });
    });
  });

  describe('Gig visibility', () => {
    it('should update the stored Moderation post after an admin visibility change', async () => {
      const moderationPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        date: 1_700_000_001_000,
      };
      const updated = buildGig({
        version: 4,
        isVisible: false,
        posts: [moderationPost],
      });
      gigRepository.updateVisibility.mockResolvedValue(updated);

      await expect(
        service.updateGigVisibilityByPublicId({
          publicId: updated.publicId,
          expectedVersion: 3,
          isVisible: false,
        }),
      ).resolves.toEqual({
        publicId: updated.publicId,
        version: 4,
        isVisible: false,
      });
      expect(updateGigModerationPost).toHaveBeenCalledWith({
        gigId: updated.id,
        expectedVersion: 4,
        isVisible: false,
        title: updated.title,
        publicId: updated.publicId,
        moderationPost: { chatId: -100123, messageId: 42 },
      });
      expect(revalidateFeed).toHaveBeenCalledWith({
        country: updated.country,
        city: updated.city,
      });
    });

    it('should use the callback Moderation post when changing visibility by Gig ID', async () => {
      const gig = buildGig();
      const updated = buildGig({ version: 4, isVisible: false });
      gigRepository.findById.mockResolvedValue(gig);
      gigRepository.updateVisibility.mockResolvedValue(updated);

      await service.setGigVisibility({
        gigId: gig.id,
        expectedVersion: 3,
        isVisible: false,
        moderationPost: { chatId: -100123, messageId: 42 },
      });

      expect(updateGigModerationPost).toHaveBeenCalledWith({
        gigId: updated.id,
        expectedVersion: 4,
        isVisible: false,
        title: updated.title,
        publicId: updated.publicId,
        moderationPost: { chatId: -100123, messageId: 42 },
      });
      expect(revalidateFeed).toHaveBeenCalledWith({
        country: updated.country,
        city: updated.city,
      });
    });

    it('should preserve visibility when the callback post update fails', async () => {
      const gig = buildGig();
      const updated = buildGig({ version: 4, isVisible: false });
      gigRepository.findById.mockResolvedValue(gig);
      gigRepository.updateVisibility.mockResolvedValue(updated);
      updateGigModerationPost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );

      await expect(
        service.setGigVisibility({
          gigId: gig.id,
          expectedVersion: 3,
          isVisible: false,
          moderationPost: { chatId: -100123, messageId: 42 },
        }),
      ).resolves.toBeUndefined();

      expect(gigRepository.updateVisibility).toHaveBeenCalledOnce();
    });
  });

  describe('createGigMainPost', () => {
    it('should send and conditionally store one Main post', async () => {
      const gig = buildGig();
      const updated = buildGig({ version: 4 });
      gigRepository.findById.mockResolvedValue(gig);
      gigRepository.appendMainPost.mockResolvedValue(updated);
      sendMainPost.mockResolvedValue({
        messageId: 42,
        chatId: -1001,
        sentAtSeconds: 1_789_603_300,
      });

      await service.createGigMainPost({
        gigId: gig.id,
        expectedVersion: 3,
      });

      expect(gigRepository.appendMainPost).toHaveBeenCalledWith({
        gigId: gig.id,
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

    it('should reject an existing Main post before Telegram is called', async () => {
      const gig = buildGig({
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Main,
            id: 42,
            chatId: -1001,
            date: 1_789_603_300_000,
          },
        ],
      });
      gigRepository.findById.mockResolvedValue(gig);

      await expect(
        service.createGigMainPost({
          gigId: gig.id,
          expectedVersion: gig.version,
        }),
      ).rejects.toMatchObject({ message: 'Gig main post already exists' });
      expect(sendMainPost).not.toHaveBeenCalled();
    });

    it('should reject a stale version before Telegram is called', async () => {
      const gig = buildGig();
      gigRepository.findById.mockResolvedValue(gig);

      await expect(
        service.createGigMainPost({
          gigId: gig.id,
          expectedVersion: gig.version - 1,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(sendMainPost).not.toHaveBeenCalled();
    });
  });
});
