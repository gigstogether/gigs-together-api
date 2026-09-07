import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { PostType } from '../../shared/types/post-type.enum';
import { TelegramService } from '../telegram/telegram.service';
import { GigModerationService } from './gig-moderation.service';
import { GigService } from './gig.service';
import type { PlainGig } from './types/gig.types';

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
  };
  const telegramService = {
    pickTgPost: vi.fn(),
    sendMainPost: vi.fn(),
    updateGigModerationPost: vi.fn(),
  };
  let service: GigModerationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        GigModerationService,
        { provide: GigService, useValue: gigService },
        { provide: TelegramService, useValue: telegramService },
      ],
    }).compile();
    service = module.get(GigModerationService);
  });

  it('should send and conditionally store one Main post', async () => {
    gigService.getGigById.mockResolvedValue(gig);
    telegramService.pickTgPost.mockReturnValue(undefined);
    telegramService.sendMainPost.mockResolvedValue({
      message_id: 44,
      chat: { id: -1001, type: 'channel' },
      date: 1_789_603_300,
    });
    gigService.appendGigMainPost.mockResolvedValue({ ...gig, version: 4 });

    await service.createGigMainPost({ gigId: gig._id, expectedVersion: 3 });

    expect(gigService.appendGigMainPost).toHaveBeenCalledWith({
      gigId: String(gig._id),
      expectedVersion: 3,
      post: { id: 44, chatId: -1001, date: 1_789_603_300_000 },
    });
  });

  it('should reject a stale version before Telegram is called', async () => {
    gigService.getGigById.mockResolvedValue(gig);

    await expect(
      service.createGigMainPost({ gigId: gig._id, expectedVersion: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(telegramService.sendMainPost).not.toHaveBeenCalled();
  });

  it('should reject an existing Main post before Telegram is called', async () => {
    gigService.getGigById.mockResolvedValue(gig);
    telegramService.pickTgPost.mockImplementation((_posts, type) =>
      type === PostType.Main ? { id: 1 } : undefined,
    );

    await expect(
      service.createGigMainPost({ gigId: gig._id, expectedVersion: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(telegramService.sendMainPost).not.toHaveBeenCalled();
  });
});
