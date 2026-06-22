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
    getGigById: vi.fn(),
    getGigByPublicId: vi.fn(),
    updateGigStatus: vi.fn(),
    updateGig: vi.fn(),
    gigToCalendarPayload: vi.fn(),
  };

  const telegramServiceMock = {
    pickTgPost: vi.fn(),
    publishMain: vi.fn(),
    updateModerationPostAfterGigPublished: vi.fn(),
    updatePublishedSubmissionFeedback: vi.fn(),
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
    telegramServiceMock.pickTgPost.mockImplementation((posts, type) =>
      posts?.find((post) => {
        return (
          post.to === Messenger.Telegram &&
          post.type === type &&
          post.chatId != null &&
          post.id != null
        );
      }),
    );

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
    it('should mark gig as published and update moderation side effects when moderation post is linked', async () => {
      const gigId = '507f1f77bcf86cd799439011';
      const gigBeforeUpdate = buildGigDocument();
      const publishedGig = buildGigDocument({ status: Status.Published });

      gigServiceMock.getGigById.mockResolvedValue(gigBeforeUpdate);
      gigServiceMock.updateGigStatus.mockResolvedValue(publishedGig);
      gigServiceMock.gigToCalendarPayload.mockReturnValue({
        title: 'Radiohead',
      });

      await service.approveGig({ gigId });

      expect(gigServiceMock.getGigById).toHaveBeenCalledWith(gigId);
      expect(gigServiceMock.getGigByPublicId).not.toHaveBeenCalled();
      expect(gigServiceMock.updateGigStatus).toHaveBeenCalledWith(
        gigId,
        Status.Published,
      );
      expect(telegramServiceMock.publishMain).not.toHaveBeenCalled();
      expect(gigServiceMock.updateGig).not.toHaveBeenCalled();
      expect(feedRevalidateServiceMock.revalidateFeed).toHaveBeenCalledWith({
        country: 'ES',
        city: 'barcelona',
      });
      expect(
        telegramServiceMock.updateModerationPostAfterGigPublished,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          moderationPost: { chatId: -100123, messageId: 42 },
        }),
      );
      expect(
        telegramServiceMock.updatePublishedSubmissionFeedback,
      ).not.toHaveBeenCalled();
      expect(calendarServiceMock.addEvent).toHaveBeenCalledWith({
        title: 'Radiohead',
      });
    });

    it('should load gig by publicId when admin path is used', async () => {
      const gigBeforeUpdate = buildGigDocument();
      const publishedGig = buildGigDocument({ status: Status.Published });

      gigServiceMock.getGigByPublicId.mockResolvedValue(gigBeforeUpdate);
      gigServiceMock.updateGigStatus.mockResolvedValue(publishedGig);
      gigServiceMock.gigToCalendarPayload.mockReturnValue({
        title: 'Radiohead',
      });

      await service.approveGig({ publicId: 'radiohead-barcelona-2026-06-12' });

      expect(gigServiceMock.getGigByPublicId).toHaveBeenCalledWith(
        'radiohead-barcelona-2026-06-12',
      );
      expect(gigServiceMock.getGigById).not.toHaveBeenCalled();
      expect(gigServiceMock.updateGigStatus).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        Status.Published,
      );
    });

    it('should throw when gig is already published', async () => {
      gigServiceMock.getGigById.mockResolvedValue(
        buildGigDocument({ status: Status.Published }),
      );

      await expect(
        service.approveGig({ gigId: '507f1f77bcf86cd799439011' }),
      ).rejects.toMatchObject({
        message: 'Gig is already published',
      });
    });
  });

  describe('publishGigPost', () => {
    it('should publish main telegram post and persist publish post metadata', async () => {
      const gigId = '507f1f77bcf86cd799439011';
      const publishedGig = buildGigDocument({ status: Status.Published });
      const publishPost = {
        message_id: 99,
        chat: { id: -100456, username: 'gigschannel' },
        date: 1_748_697_600,
      };

      gigServiceMock.getGigById.mockResolvedValue(publishedGig);
      telegramServiceMock.publishMain.mockResolvedValue(publishPost);
      gigServiceMock.updateGig.mockResolvedValue(publishedGig);

      await service.publishGigPost({ gigId });

      expect(gigServiceMock.getGigById).toHaveBeenCalledWith(gigId);
      expect(telegramServiceMock.publishMain).toHaveBeenCalledWith(
        publishedGig,
      );
      expect(gigServiceMock.updateGig).toHaveBeenCalledWith(
        gigId,
        expect.objectContaining({
          $push: expect.objectContaining({
            posts: expect.objectContaining({
              id: 99,
              chatId: -100456,
              to: Messenger.Telegram,
              type: PostType.Publish,
            }),
          }),
        }),
      );
      expect(
        telegramServiceMock.updateModerationPostAfterGigPublished,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          moderationPost: { chatId: -100123, messageId: 42 },
          publishPost: {
            chatId: -100456,
            messageId: 99,
            username: 'gigschannel',
          },
        }),
      );
      expect(
        telegramServiceMock.updatePublishedSubmissionFeedback,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Radiohead',
          publicId: 'radiohead-barcelona-2026-06-12',
          country: 'ES',
          city: 'barcelona',
        }),
      );
    });

    it('should throw when gig is not yet published in feed', async () => {
      gigServiceMock.getGigById.mockResolvedValue(
        buildGigDocument({ status: Status.Pending }),
      );

      await expect(
        service.publishGigPost({ gigId: '507f1f77bcf86cd799439011' }),
      ).rejects.toMatchObject({
        message: 'Gig must be published before publishing main post',
      });
    });

    it('should throw when main telegram post already exists', async () => {
      const publishPost = {
        to: Messenger.Telegram,
        type: PostType.Publish,
        chatId: -100456,
        id: 99,
        date: new Date('2026-06-01T10:00:00.000Z').getTime(),
      };

      gigServiceMock.getGigById.mockResolvedValue(
        buildGigDocument({
          status: Status.Published,
          posts: [publishPost],
        }),
      );

      await expect(
        service.publishGigPost({ gigId: '507f1f77bcf86cd799439011' }),
      ).rejects.toMatchObject({
        message: 'Gig main post is already published',
      });
    });
  });

  describe('rejectGig', () => {
    it('should reject gig and update telegram moderation post when moderation post is linked', async () => {
      const gigId = '507f1f77bcf86cd799439011';
      const gigBeforeUpdate = buildGigDocument();
      const rejectedGig = buildGigDocument({ status: Status.Rejected });

      gigServiceMock.getGigById.mockResolvedValue(gigBeforeUpdate);
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
      gigServiceMock.getGigById.mockResolvedValue(
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
