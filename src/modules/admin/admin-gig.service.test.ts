import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { AdminGigService } from './admin-gig.service';
import { GigService } from '../gig/gig.service';
import type { GigPost } from '../gig/gig.schema';
import type { PlainGig } from '../gig/types/gig.types';
import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { Status } from '../gig/types/status.enum';
import { TelegramService } from '../telegram/telegram.service';
import type { GetPostUrlPayload } from '../telegram/types/telegram-post-composer.service.types';

function buildPlainGig(overrides: Partial<PlainGig> = {}): PlainGig {
  const id = new Types.ObjectId('507f1f77bcf86cd799439011');
  return {
    _id: id,
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: new Date('2026-06-12T12:00:00.000Z').getTime(),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://example.com/tickets',
    status: Status.Pending,
    posts: [
      {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        date: new Date('2026-05-30T14:22:00.000Z').getTime(),
      },
    ],
    suggestedBy: { userId: 9001 },
    ...overrides,
  };
}

describe('AdminGigService', () => {
  let service: AdminGigService;

  const gigServiceMock = {
    getGigsByStatus: vi.fn(),
    getGigByPublicId: vi.fn(),
    resolveGigPosterPublicUrl: vi.fn(),
    resolvePublicPostUrl: vi.fn(),
  };

  const telegramServiceMock = {
    pickTgPost: vi.fn(),
    getPostUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    telegramServiceMock.pickTgPost.mockImplementation(
      (posts: GigPost[] | undefined, type: PostType): GigPost | undefined => {
        return posts?.find((post) => {
          return post.to === Messenger.Telegram && post.type === type;
        });
      },
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
        {
          provide: GigService,
          useValue: gigServiceMock,
        },
        {
          provide: TelegramService,
          useValue: telegramServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminGigService>(AdminGigService);
  });

  describe('getGigsList', () => {
    it('should map gig document fields for admin list response', async () => {
      const gig = buildPlainGig();
      gigServiceMock.getGigsByStatus.mockResolvedValue([gig]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(
        'https://t.me/channel/1',
      );

      await expect(
        service.getGigsList({ status: 'pending', limit: 50 }),
      ).resolves.toEqual({
        gigs: [
          {
            publicId: 'radiohead-barcelona-2026-06-12',
            title: 'Radiohead',
            status: Status.Pending,
            date: '2026-06-12',
            endDate: undefined,
            city: 'barcelona',
            country: 'ES',
            venue: 'Palau Sant Jordi',
            posterUrl: 'https://cdn.example/poster.jpg',
            suggestedBy: { userId: '9001' },
            ticketsUrl: 'https://example.com/tickets',
            publishPostUrl: 'https://t.me/channel/1',
            publishPostDate: undefined,
            moderationPostUrl: 'https://t.me/c/123/42',
            moderationPostDate: new Date('2026-05-30T14:22:00.000Z').getTime(),
          },
        ],
      });

      expect(gigServiceMock.getGigsByStatus).toHaveBeenCalledWith({
        statuses: [Status.Pending, Status.New],
        limit: 50,
        sortBy: undefined,
        sortOrder: undefined,
      });
    });

    it('should map publishPostDate and moderationPostDate from telegram posts', async () => {
      const publishedAt = new Date('2026-06-01T10:00:00.000Z').getTime();
      const moderationAt = new Date('2026-05-30T14:22:00.000Z').getTime();
      const gig = buildPlainGig({
        status: Status.Approved,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: -100123,
            id: 42,
            date: moderationAt,
          },
          {
            to: Messenger.Telegram,
            type: PostType.Publish,
            chatId: -100456,
            id: 99,
            date: publishedAt,
          },
        ],
      });

      gigServiceMock.getGigsByStatus.mockResolvedValue([gig]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);

      await expect(
        service.getGigsList({ status: 'approved', limit: 20 }),
      ).resolves.toEqual({
        gigs: [
          expect.objectContaining({
            publishPostDate: publishedAt,
            moderationPostUrl: 'https://t.me/c/123/42',
            moderationPostDate: moderationAt,
          }),
        ],
      });

      expect(gigServiceMock.getGigsByStatus).toHaveBeenCalledWith({
        statuses: [Status.Approved, Status.Published],
        limit: 20,
        sortBy: undefined,
        sortOrder: undefined,
      });
    });

    it('should omit publishPostDate when publish post has no date', async () => {
      const gig = buildPlainGig({
        status: Status.Approved,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Publish,
            chatId: -100456,
            id: 99,
          } as never,
        ],
      });

      gigServiceMock.getGigsByStatus.mockResolvedValue([gig]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);

      const result = await service.getGigsList({
        status: 'approved',
        limit: 20,
      });

      expect(result.gigs[0]?.publishPostDate).toBeUndefined();
    });

    it('should omit empty ticketsUrl', async () => {
      const gig = buildPlainGig({ ticketsUrl: '   ' });
      gigServiceMock.getGigsByStatus.mockResolvedValue([gig]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);

      const result = await service.getGigsList({
        status: 'pending',
        limit: 20,
      });

      expect(result.gigs[0]?.ticketsUrl).toBeUndefined();
    });
  });

  describe('getGigByPublicId', () => {
    it('should map full gig fields for admin edit and preview', async () => {
      const gig = buildPlainGig();
      gigServiceMock.getGigByPublicId.mockResolvedValue(gig);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      gigServiceMock.resolvePublicPostUrl.mockResolvedValue(
        'https://t.me/channel/1',
      );

      await expect(
        service.getGigByPublicId('radiohead-barcelona-2026-06-12'),
      ).resolves.toEqual({
        publicId: 'radiohead-barcelona-2026-06-12',
        title: 'Radiohead',
        status: Status.Pending,
        date: '2026-06-12',
        endDate: undefined,
        city: 'barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        posterUrl: 'https://cdn.example/poster.jpg',
        suggestedBy: { userId: '9001' },
        ticketsUrl: 'https://example.com/tickets',
        publishPostUrl: 'https://t.me/channel/1',
        publishPostDate: undefined,
        moderationPostUrl: 'https://t.me/c/123/42',
        moderationPostDate: new Date('2026-05-30T14:22:00.000Z').getTime(),
      });

      expect(gigServiceMock.getGigByPublicId).toHaveBeenCalledWith(
        'radiohead-barcelona-2026-06-12',
      );
    });
  });
});
