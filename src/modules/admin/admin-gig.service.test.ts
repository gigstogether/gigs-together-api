import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { AdminGigService } from './admin-gig.service';
import type { GigDocument } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { Status } from '../gig/types/status.enum';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';

function buildGigDoc(overrides: Partial<GigDocument> = {}): GigDocument {
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
  } as GigDocument;
}

describe('AdminGigService', () => {
  let service: AdminGigService;

  const gigServiceMock = {
    getGigsByStatus: vi.fn(),
    resolveGigPosterPublicUrl: vi.fn(),
    resolvePublishedPostUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGigService,
        {
          provide: GigService,
          useValue: gigServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminGigService>(AdminGigService);
  });

  describe('getGigsList', () => {
    it('should map gig document fields for admin list response', async () => {
      const gig = buildGigDoc();
      gigServiceMock.getGigsByStatus.mockResolvedValue([gig]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      gigServiceMock.resolvePublishedPostUrl.mockResolvedValue(
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
            city: 'barcelona',
            countryCode: 'ES',
            venue: 'Palau Sant Jordi',
            posterUrl: 'https://cdn.example/poster.jpg',
            suggestedBy: { userId: '9001' },
            ticketsUrl: 'https://example.com/tickets',
            postUrl: 'https://t.me/channel/1',
            moderationPostDate: new Date('2026-05-30T14:22:00.000Z').getTime(),
          },
        ],
      });

      expect(gigServiceMock.getGigsByStatus).toHaveBeenCalledWith({
        status: Status.Pending,
        limit: 50,
        sortBy: undefined,
        sortOrder: undefined,
      });
    });

    it('should map publishPostDate and moderationPostDate from telegram posts', async () => {
      const publishedAt = new Date('2026-06-01T10:00:00.000Z').getTime();
      const moderationAt = new Date('2026-05-30T14:22:00.000Z').getTime();
      const gig = buildGigDoc({
        status: Status.Published,
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
      gigServiceMock.resolvePublishedPostUrl.mockResolvedValue(undefined);

      await expect(
        service.getGigsList({ status: 'published', limit: 20 }),
      ).resolves.toEqual({
        gigs: [
          expect.objectContaining({
            publishPostDate: publishedAt,
            moderationPostDate: moderationAt,
          }),
        ],
      });
    });

    it('should omit publishPostDate when publish post has no date', async () => {
      const gig = buildGigDoc({
        status: Status.Published,
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
      gigServiceMock.resolvePublishedPostUrl.mockResolvedValue(undefined);

      const result = await service.getGigsList({
        status: 'published',
        limit: 20,
      });

      expect(result.gigs[0]?.publishPostDate).toBeUndefined();
    });

    it('should omit empty ticketsUrl', async () => {
      const gig = buildGigDoc({ ticketsUrl: '   ' });
      gigServiceMock.getGigsByStatus.mockResolvedValue([gig]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublishedPostUrl.mockResolvedValue(undefined);

      const result = await service.getGigsList({
        status: 'pending',
        limit: 20,
      });

      expect(result.gigs[0]?.ticketsUrl).toBeUndefined();
    });
  });
});
