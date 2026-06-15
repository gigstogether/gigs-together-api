import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { CalendarService } from '../calendar/calendar.service';
import { TelegramService } from '../telegram/telegram.service';
import { FeedRevalidateService } from './feed-revalidate.service';
import { GigModerationService } from './gig-moderation.service';
import { GigService } from './gig.service';
import { Messenger } from './types/messenger.enum';
import { PostType } from './types/postType.enum';
import { Status } from './types/status.enum';
import type { GigDocument } from './gig.schema';

function buildGigDocument(overrides: Partial<GigDocument> = {}): GigDocument {
  return {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
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
  } as unknown as GigDocument;
}

describe('GigModerationService', () => {
  let service: GigModerationService;

  const gigServiceMock = {
    getGigDocumentById: vi.fn(),
    getGigDocumentByPublicId: vi.fn(),
    updateGigStatus: vi.fn(),
    updateGig: vi.fn(),
    gigToCalendarPayload: vi.fn(),
  };

  const telegramServiceMock = {
    pickTgPost: vi.fn(),
    publishMain: vi.fn(),
    handleAfterPublish: vi.fn(),
    handlePostReject: vi.fn(),
  };

  const calendarServiceMock = {
    addEvent: vi.fn(),
  };

  const feedRevalidateServiceMock = {
    revalidateFeed: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigModerationService,
        { provide: GigService, useValue: gigServiceMock },
        { provide: TelegramService, useValue: telegramServiceMock },
        { provide: CalendarService, useValue: calendarServiceMock },
        {
          provide: FeedRevalidateService,
          useValue: feedRevalidateServiceMock,
        },
      ],
    }).compile();

    service = module.get<GigModerationService>(GigModerationService);
  });

  describe('approveGig', () => {
    it('should publish gig and update telegram moderation post when moderation post is linked', async () => {
      const gigId = '507f1f77bcf86cd799439011';
      const gigBeforeUpdate = buildGigDocument();
      const approvedGig = buildGigDocument({ status: Status.Approved });
      const publishPost = {
        message_id: 99,
        chat: { id: -100456, username: 'gigschannel' },
        date: 1_748_697_600,
      };

      gigServiceMock.getGigDocumentById.mockResolvedValue(gigBeforeUpdate);
      telegramServiceMock.pickTgPost.mockReturnValue(gigBeforeUpdate.posts[0]);
      gigServiceMock.updateGigStatus.mockResolvedValue(approvedGig);
      telegramServiceMock.publishMain.mockResolvedValue(publishPost);
      gigServiceMock.gigToCalendarPayload.mockReturnValue({
        title: 'Radiohead',
      });

      await service.approveGig({ gigId });

      expect(gigServiceMock.getGigDocumentById).toHaveBeenCalledWith(gigId);
      expect(gigServiceMock.getGigDocumentByPublicId).not.toHaveBeenCalled();
      expect(gigServiceMock.updateGigStatus).toHaveBeenCalledWith(
        gigId,
        Status.Approved,
      );
      expect(telegramServiceMock.publishMain).toHaveBeenCalledWith(approvedGig);
      expect(gigServiceMock.updateGig).toHaveBeenCalledWith(
        gigId,
        expect.objectContaining({ status: Status.Published }),
      );
      expect(feedRevalidateServiceMock.revalidateFeed).toHaveBeenCalledWith({
        country: 'ES',
        city: 'barcelona',
      });
      expect(telegramServiceMock.handleAfterPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          moderationPost: { chatId: -100123, messageId: 42 },
        }),
      );
      expect(calendarServiceMock.addEvent).toHaveBeenCalledWith({
        title: 'Radiohead',
      });
    });

    it('should load gig by publicId when admin path is used', async () => {
      const gigBeforeUpdate = buildGigDocument();
      const approvedGig = buildGigDocument({ status: Status.Approved });

      gigServiceMock.getGigDocumentByPublicId.mockResolvedValue(
        gigBeforeUpdate,
      );
      telegramServiceMock.pickTgPost.mockReturnValue(undefined);
      gigServiceMock.updateGigStatus.mockResolvedValue(approvedGig);
      telegramServiceMock.publishMain.mockResolvedValue(undefined);
      gigServiceMock.gigToCalendarPayload.mockReturnValue({
        title: 'Radiohead',
      });

      await service.approveGig({ publicId: 'radiohead-barcelona-2026-06-12' });

      expect(gigServiceMock.getGigDocumentByPublicId).toHaveBeenCalledWith(
        'radiohead-barcelona-2026-06-12',
      );
      expect(gigServiceMock.getGigDocumentById).not.toHaveBeenCalled();
      expect(gigServiceMock.updateGigStatus).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        Status.Approved,
      );
    });

    it('should throw when gig is already published', async () => {
      gigServiceMock.getGigDocumentById.mockResolvedValue(
        buildGigDocument({ status: Status.Published }),
      );

      await expect(
        service.approveGig({ gigId: '507f1f77bcf86cd799439011' }),
      ).rejects.toMatchObject({
        message: 'Gig is already published',
      });
    });
  });

  describe('rejectGig', () => {
    it('should reject gig and update telegram moderation post when moderation post is linked', async () => {
      const gigId = '507f1f77bcf86cd799439011';
      const gigBeforeUpdate = buildGigDocument();
      const rejectedGig = buildGigDocument({ status: Status.Rejected });

      gigServiceMock.getGigDocumentById.mockResolvedValue(gigBeforeUpdate);
      telegramServiceMock.pickTgPost.mockReturnValue(gigBeforeUpdate.posts[0]);
      gigServiceMock.updateGigStatus.mockResolvedValue(rejectedGig);

      await service.rejectGig({ gigId });

      expect(gigServiceMock.updateGigStatus).toHaveBeenCalledWith(
        gigId,
        Status.Rejected,
      );
      expect(telegramServiceMock.handlePostReject).toHaveBeenCalledWith(
        expect.objectContaining({
          moderationMessage: { chatId: -100123, messageId: 42 },
        }),
      );
    });

    it('should throw when gig is already published', async () => {
      gigServiceMock.getGigDocumentById.mockResolvedValue(
        buildGigDocument({ status: Status.Published }),
      );

      await expect(
        service.rejectGig({ gigId: '507f1f77bcf86cd799439011' }),
      ).rejects.toMatchObject({
        message: 'Cannot reject a published gig',
      });
    });
  });
});
