import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { PostType } from '../../shared/types/post-type.enum';
import { Messenger } from '../../shared/types/messenger.enum';
import { TelegramService } from '../telegram/telegram.service';
import { GigModerationService } from './gig-moderation.service';
import { GigService } from './gig.service';
import type { PlainGig } from './types/gig.types';
import { FeedRevalidateService } from './feed-revalidate.service';

describe('GigModerationService', () => {
  const gig: PlainGig = {
    _id: new Types.ObjectId(),
    publicId: 'test-gig-2026-09-17',
    title: 'Test Gig',
    date: 1_789_603_200_000,
    city: 'barcelona',
    country: 'ES',
    venue: 'Venue',
    ticketsUrl: 'https://tickets.example',
    isVisible: true,
    version: 3,
    source: {
      type: 'user',
      userId: new Types.ObjectId(),
      origin: { type: 'admin' },
    },
    posts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const gigService = {
    getGigById: vi.fn(),
    getGigByPublicId: vi.fn(),
    appendGigMainPost: vi.fn(),
    updateGigVisibilityByPublicId: vi.fn(),
  };
  const telegramService = {
    pickTgPost: vi.fn(),
    publishMain: vi.fn(),
    updateGigModerationPost: vi.fn(),
  };
  const feedRevalidateService = {
    revalidateFeed: vi.fn(),
  };
  let service: GigModerationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        GigModerationService,
        { provide: GigService, useValue: gigService },
        { provide: TelegramService, useValue: telegramService },
        {
          provide: FeedRevalidateService,
          useValue: feedRevalidateService,
        },
      ],
    }).compile();
    service = module.get(GigModerationService);
  });

  it('should publish and conditionally store one Main post', async () => {
    gigService.getGigById.mockResolvedValue(gig);
    telegramService.pickTgPost.mockReturnValue(undefined);
    telegramService.publishMain.mockResolvedValue({
      message_id: 44,
      chat: { id: -1001, type: 'channel' },
      date: 1_789_603_300,
    });
    gigService.appendGigMainPost.mockResolvedValue({ ...gig, version: 4 });

    await service.publishGigPost({ gigId: gig._id, expectedVersion: 3 });

    expect(gigService.appendGigMainPost).toHaveBeenCalledWith({
      gigId: String(gig._id),
      expectedVersion: 3,
      post: { id: 44, chatId: -1001, date: 1_789_603_300_000 },
    });
  });

  it('should reject a stale version before Telegram is called', async () => {
    gigService.getGigById.mockResolvedValue(gig);

    await expect(
      service.publishGigPost({ gigId: gig._id, expectedVersion: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(telegramService.publishMain).not.toHaveBeenCalled();
  });

  it('should reject an existing Main post before Telegram is called', async () => {
    gigService.getGigById.mockResolvedValue(gig);
    telegramService.pickTgPost.mockImplementation((_posts, type) =>
      type === PostType.Main ? { id: 1 } : undefined,
    );

    await expect(
      service.publishGigPost({ gigId: gig._id, expectedVersion: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(telegramService.publishMain).not.toHaveBeenCalled();
  });

  it('should hide the Gig and replace Hide with Show in its moderation post', async () => {
    const mainPost = {
      to: Messenger.Telegram,
      type: PostType.Main,
      id: 44,
      chatId: -1001,
      date: 1_789_603_300_000,
    };
    const updatedGig = {
      ...gig,
      isVisible: false,
      version: 4,
      posts: [mainPost],
    };
    gigService.getGigById.mockResolvedValue(gig);
    gigService.updateGigVisibilityByPublicId.mockResolvedValue(updatedGig);
    telegramService.pickTgPost.mockReturnValue(mainPost);

    await service.setGigVisibility({
      gigId: gig._id,
      expectedVersion: 3,
      isVisible: false,
      moderationPost: { chatId: -1002, messageId: 55 },
    });

    expect(gigService.updateGigVisibilityByPublicId).toHaveBeenCalledWith({
      publicId: gig.publicId,
      expectedVersion: 3,
      isVisible: false,
    });
    expect(feedRevalidateService.revalidateFeed).toHaveBeenCalledWith({
      country: gig.country,
      city: gig.city,
    });
    expect(telegramService.updateGigModerationPost).toHaveBeenCalledWith({
      gigId: String(gig._id),
      expectedVersion: 4,
      isVisible: false,
      title: gig.title,
      publicId: gig.publicId,
      moderationPost: { chatId: -1002, messageId: 55 },
      mainPost: { chatId: -1001, messageId: 44 },
    });
  });

  it('should show the Gig and replace Show with Hide in its moderation post', async () => {
    const hiddenGig = { ...gig, isVisible: false, version: 4 };
    const updatedGig = { ...hiddenGig, isVisible: true, version: 5 };
    gigService.getGigById.mockResolvedValue(hiddenGig);
    gigService.updateGigVisibilityByPublicId.mockResolvedValue(updatedGig);
    telegramService.pickTgPost.mockReturnValue(undefined);

    await service.setGigVisibility({
      gigId: gig._id,
      expectedVersion: 4,
      isVisible: true,
      moderationPost: { chatId: -1002, messageId: 55 },
    });

    expect(gigService.updateGigVisibilityByPublicId).toHaveBeenCalledWith({
      publicId: gig.publicId,
      expectedVersion: 4,
      isVisible: true,
    });
    expect(telegramService.updateGigModerationPost).toHaveBeenCalledWith({
      gigId: String(gig._id),
      expectedVersion: 5,
      isVisible: true,
      title: gig.title,
      publicId: gig.publicId,
      moderationPost: { chatId: -1002, messageId: 55 },
      mainPost: undefined,
    });
  });

  it('should reject a stale visibility callback before changing visibility', async () => {
    gigService.getGigById.mockResolvedValue(gig);

    await expect(
      service.setGigVisibility({
        gigId: gig._id,
        expectedVersion: 2,
        isVisible: false,
        moderationPost: { chatId: -1002, messageId: 55 },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(gigService.updateGigVisibilityByPublicId).not.toHaveBeenCalled();
  });

  it('should keep the Gig hidden when its moderation post update fails', async () => {
    const updatedGig = { ...gig, isVisible: false, version: 4 };
    gigService.getGigById.mockResolvedValue(gig);
    gigService.updateGigVisibilityByPublicId.mockResolvedValue(updatedGig);
    telegramService.pickTgPost.mockReturnValue(undefined);
    telegramService.updateGigModerationPost.mockRejectedValue(
      new Error('Telegram unavailable'),
    );

    await expect(
      service.setGigVisibility({
        gigId: gig._id,
        expectedVersion: 3,
        isVisible: false,
        moderationPost: { chatId: -1002, messageId: 55 },
      }),
    ).resolves.toBeUndefined();

    expect(gigService.updateGigVisibilityByPublicId).toHaveBeenCalledOnce();
  });
});
