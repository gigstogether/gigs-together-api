import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { FeedRevalidateService } from '../gig/feed-revalidate.service';
import type { GigPost } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import type { PlainGig } from '../gig/types/gig.types';
import { TelegramService } from '../telegram/telegram.service';
import type { GetPostUrlPayload } from '../telegram/types/telegram-post-composer.service.types';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { AdminGigService } from './admin-gig.service';

function buildPlainGig(overrides: Partial<PlainGig> = {}): PlainGig {
  return {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: new Date('2026-06-12T12:00:00.000Z').getTime(),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://example.com/tickets',
    isVisible: false,
    version: 3,
    source: {
      type: 'user',
      userId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      origin: { type: 'admin' },
    },
    posts: [
      {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        date: new Date('2026-05-30T14:22:00.000Z').getTime(),
      },
    ],
    createdAt: new Date('2026-05-30T14:22:00.000Z'),
    updatedAt: new Date('2026-05-30T14:22:00.000Z'),
    ...overrides,
  };
}

describe('AdminGigService', () => {
  let service: AdminGigService;

  const gigServiceMock = {
    getGigs: vi.fn(),
    getGigByPublicId: vi.fn(),
    resolveGigPosterPublicUrl: vi.fn(),
    resolvePublicPostUrl: vi.fn(),
    updateGigByPublicId: vi.fn(),
    updateGigVisibilityByPublicId: vi.fn(),
    updateGigTelegramPostFileId: vi.fn(),
  };
  const telegramServiceMock = {
    pickTgPost: vi.fn(),
    getPostUrl: vi.fn(),
    editMainPost: vi.fn(),
    editModerationPost: vi.fn(),
    updateGigModerationPost: vi.fn(),
  };
  const feedRevalidateServiceMock = { revalidateFeed: vi.fn() };
  const userServiceMock = { findActiveUsersByIds: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    userServiceMock.findActiveUsersByIds.mockResolvedValue([
      {
        id: '507f1f77bcf86cd799439012',
        status: 'active',
        roles: [UserRole.Admin],
        identities: [
          {
            type: 'messenger',
            messenger: Messenger.Telegram,
            externalUserId: '42',
            username: 'test_admin',
          },
        ],
        displayName: 'Test Admin',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        updatedAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    ]);
    telegramServiceMock.pickTgPost.mockImplementation(
      (posts: GigPost[] | undefined, type: PostType): GigPost | undefined =>
        posts?.find(
          (post) => post.to === Messenger.Telegram && post.type === type,
        ),
    );
    telegramServiceMock.getPostUrl.mockImplementation(
      (payload: GetPostUrlPayload): string | undefined => {
        if ('chatUsername' in payload && payload.chatUsername) {
          return `https://t.me/${payload.chatUsername}/${payload.messageId}`;
        }
        if ('chatId' in payload && payload.chatId) {
          const rawChatId = String(payload.chatId);
          const internalChatId = rawChatId.startsWith('-100')
            ? rawChatId.slice(4)
            : rawChatId;
          return `https://t.me/c/${internalChatId}/${payload.messageId}`;
        }
        return undefined;
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGigService,
        { provide: GigService, useValue: gigServiceMock },
        { provide: TelegramService, useValue: telegramServiceMock },
        {
          provide: FeedRevalidateService,
          useValue: feedRevalidateServiceMock,
        },
        { provide: UserService, useValue: userServiceMock },
      ],
    }).compile();
    service = module.get(AdminGigService);
  });

  describe('getGigsList', () => {
    it('should map Gig fields and source for the admin list', async () => {
      const gig = buildPlainGig();
      gigServiceMock.getGigs.mockResolvedValue([gig]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(
        'https://t.me/channel/1',
      );

      await expect(service.getGigsList({ limit: 50 })).resolves.toEqual({
        gigs: [
          {
            publicId: 'radiohead-barcelona-2026-06-12',
            title: 'Radiohead',
            isVisible: false,
            version: 3,
            source: {
              type: 'user',
              userId: '507f1f77bcf86cd799439012',
              displayName: 'Test Admin',
              isCurrentlyAdmin: true,
              telegramUsername: 'test_admin',
              origin: { type: 'admin' },
            },
            date: '2026-06-12',
            endDate: undefined,
            city: 'barcelona',
            country: 'ES',
            venue: 'Palau Sant Jordi',
            posterUrl: 'https://cdn.example/poster.jpg',
            ticketsUrl: 'https://example.com/tickets',
            publishPostUrl: 'https://t.me/channel/1',
            publishPostDate: undefined,
            moderationPostUrl: 'https://t.me/c/123/42',
            moderationPostDate: new Date('2026-05-30T14:22:00.000Z').getTime(),
          },
        ],
      });
      expect(gigServiceMock.getGigs).toHaveBeenCalledWith({
        limit: 50,
        sortBy: undefined,
        sortOrder: undefined,
      });
      expect(userServiceMock.findActiveUsersByIds).toHaveBeenCalledOnce();
      expect(userServiceMock.findActiveUsersByIds).toHaveBeenCalledWith([
        '507f1f77bcf86cd799439012',
      ]);
    });

    it('should map Main and moderation post dates', async () => {
      const mainPostDate = new Date('2026-06-01T10:00:00.000Z').getTime();
      const moderationPostDate = new Date('2026-05-30T14:22:00.000Z').getTime();
      gigServiceMock.getGigs.mockResolvedValue([
        buildPlainGig({
          posts: [
            {
              to: Messenger.Telegram,
              type: PostType.Moderation,
              chatId: -100123,
              id: 42,
              date: moderationPostDate,
            },
            {
              to: Messenger.Telegram,
              type: PostType.Main,
              chatId: -100456,
              id: 99,
              date: mainPostDate,
            },
          ],
        }),
      ]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);

      const result = await service.getGigsList({ limit: 20 });

      expect(result.gigs[0]).toEqual(
        expect.objectContaining({
          publishPostDate: mainPostDate,
          moderationPostDate,
        }),
      );
    });

    it('should omit an empty tickets URL', async () => {
      gigServiceMock.getGigs.mockResolvedValue([
        buildPlainGig({ ticketsUrl: '   ' }),
      ]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);

      const result = await service.getGigsList({ limit: 20 });

      expect(result.gigs[0]?.ticketsUrl).toBeUndefined();
    });
  });

  describe('getGigByPublicId', () => {
    it('should map full Gig fields for admin edit and preview', async () => {
      const gig = buildPlainGig();
      gigServiceMock.getGigByPublicId.mockResolvedValue(gig);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(
        'https://t.me/channel/1',
      );

      const result = await service.getGigByPublicId(gig.publicId);

      expect(result).toEqual(
        expect.objectContaining({
          publicId: gig.publicId,
          source: {
            type: 'user',
            userId: '507f1f77bcf86cd799439012',
            displayName: 'Test Admin',
            isCurrentlyAdmin: true,
            telegramUsername: 'test_admin',
            origin: { type: 'admin' },
          },
        }),
      );
    });

    it('should include displayName but not the admin marker for a non-admin user', async () => {
      const gig = buildPlainGig();
      gigServiceMock.getGigByPublicId.mockResolvedValue(gig);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);
      userServiceMock.findActiveUsersByIds.mockResolvedValue([
        {
          id: '507f1f77bcf86cd799439012',
          status: 'active',
          roles: [],
          identities: [],
          displayName: 'Former Admin',
          createdAt: new Date('2026-05-01T10:00:00.000Z'),
          updatedAt: new Date('2026-05-01T10:00:00.000Z'),
        },
      ]);

      const result = await service.getGigByPublicId(gig.publicId);

      expect(result.source).toEqual(
        expect.objectContaining({
          displayName: 'Former Admin',
          isCurrentlyAdmin: false,
        }),
      );
    });
  });

  describe('updateGigByPublicId', () => {
    it('should preserve the database update when Telegram editing fails', async () => {
      const gig = buildPlainGig({ version: 4 });
      gigServiceMock.updateGigByPublicId.mockResolvedValue(gig);
      telegramServiceMock.editModerationPost.mockRejectedValue(
        new Error('Telegram unavailable'),
      );

      await expect(
        service.updateGigByPublicId({
          publicId: gig.publicId,
          expectedVersion: 3,
          gig: {
            title: gig.title,
            date: '2026-06-12',
            city: gig.city,
            country: gig.country,
            venue: gig.venue,
            ticketsUrl: gig.ticketsUrl,
          },
          posterFile: undefined,
        }),
      ).resolves.toEqual({ publicId: gig.publicId });
      expect(feedRevalidateServiceMock.revalidateFeed).toHaveBeenCalledWith({
        country: 'ES',
        city: 'barcelona',
      });
    });

    it('should update both Main and Moderation posts after a Gig edit', async () => {
      const mainPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        chatId: -100456,
        id: 99,
        date: 1_700_000_002_000,
      };
      const moderationPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        date: 1_700_000_001_000,
      };
      const gig = buildPlainGig({
        title: 'Updated title',
        version: 4,
        posts: [moderationPost, mainPost],
      });
      gigServiceMock.updateGigByPublicId.mockResolvedValue(gig);

      await service.updateGigByPublicId({
        publicId: gig.publicId,
        expectedVersion: 3,
        gig: {
          title: gig.title,
          date: '2026-06-12',
          city: gig.city,
          country: gig.country,
          venue: gig.venue,
          ticketsUrl: gig.ticketsUrl,
        },
        posterFile: undefined,
      });

      expect(telegramServiceMock.editMainPost).toHaveBeenCalledWith(gig, {
        updateMedia: false,
      });
      expect(telegramServiceMock.updateGigModerationPost).toHaveBeenCalledWith({
        gigId: gig._id,
        expectedVersion: gig.version,
        isVisible: gig.isVisible,
        title: 'Updated title',
        publicId: gig.publicId,
        moderationPost: { chatId: -100123, messageId: 42 },
        mainPost: { chatId: -100456, messageId: 99 },
      });
    });
  });

  describe('updateGigVisibilityByPublicId', () => {
    it('should conditionally change visibility and revalidate the affected feed', async () => {
      gigServiceMock.updateGigVisibilityByPublicId.mockResolvedValue(
        buildPlainGig({ version: 4, isVisible: false }),
      );

      await expect(
        service.updateGigVisibilityByPublicId({
          publicId: 'radiohead-barcelona-2026-06-12',
          expectedVersion: 3,
          isVisible: false,
        }),
      ).resolves.toEqual({
        publicId: 'radiohead-barcelona-2026-06-12',
        version: 4,
        isVisible: false,
      });
      expect(feedRevalidateServiceMock.revalidateFeed).toHaveBeenCalledWith({
        country: 'ES',
        city: 'barcelona',
      });
    });
  });
});
