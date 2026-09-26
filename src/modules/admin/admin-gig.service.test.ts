import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { GigService } from '../gig/gig.service';
import type { GigPost, PlainGig } from '../gig/types/gig.types';
import { TelegramService } from '../telegram/telegram.service';
import type { GetPostUrlPayload } from '../telegram/telegram-post-composer.service.types';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { AdminGigService } from './admin-gig.service';

function buildPlainGig(overrides: Partial<PlainGig> = {}): PlainGig {
  return {
    id: '507f1f77bcf86cd799439011',
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
      userId: '507f1f77bcf86cd799439012',
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
  };
  const telegramServiceMock = {
    pickTgPost: vi.fn(),
    getPostUrl: vi.fn(),
  };
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
        { provide: UserService, useValue: userServiceMock },
      ],
    }).compile();
    service = module.get(AdminGigService);
  });

  it('should map Gig fields and source for the admin list', async () => {
    const gig = buildPlainGig();
    gigServiceMock.getGigs.mockResolvedValue([gig]);
    gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(
      'https://cdn.example/poster.jpg',
    );
    gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);

    const result = await service.getGigsList({ limit: 50 });

    expect(result.gigs[0]).toEqual(
      expect.objectContaining({
        publicId: gig.publicId,
        title: gig.title,
        source: expect.objectContaining({
          displayName: 'Test Admin',
          isCurrentlyAdmin: true,
        }),
        posterUrl: 'https://cdn.example/poster.jpg',
      }),
    );
  });

  it('should map Main and Moderation post metadata for admin detail', async () => {
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
    const gig = buildPlainGig({ posts: [moderationPost, mainPost] });
    gigServiceMock.getGigByPublicId.mockResolvedValue(gig);
    gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
    gigServiceMock.resolvePublicPostUrl.mockResolvedValue(
      'https://t.me/channel/99',
    );

    const result = await service.getGigByPublicId(gig.publicId);

    expect(result).toEqual(
      expect.objectContaining({
        mainPostUrl: 'https://t.me/channel/99',
        mainPostDate: mainPost.date,
        moderationPostUrl: 'https://t.me/c/123/42',
        moderationPostDate: moderationPost.date,
      }),
    );
  });

  it('should omit an empty tickets URL from the admin list', async () => {
    const gig = buildPlainGig({ ticketsUrl: '   ' });
    gigServiceMock.getGigs.mockResolvedValue([gig]);
    gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
    gigServiceMock.resolvePublicPostUrl.mockResolvedValue(undefined);

    const result = await service.getGigsList({ limit: 50 });

    expect(result.gigs[0]?.ticketsUrl).toBeUndefined();
  });
});
