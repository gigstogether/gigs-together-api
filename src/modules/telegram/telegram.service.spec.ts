import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { of } from 'rxjs';
import type { TGMessage } from './types/message.types';
import type { GigDocument } from '../gig/gig.schema';
import type { PlainGig } from '../gig/types/gig.types';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { Status } from '../gig/types/status.enum';
import { BucketService } from '../bucket/bucket.service';
import {
  TelegramService,
  WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
} from './telegram.service';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import { Types } from 'mongoose';

describe('TelegramService', () => {
  let service: TelegramService;
  let testingModule: TestingModule;

  const mockHttpService = {
    post: vi.fn(),
    get: vi.fn(),
  };

  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    reset: vi.fn(),
  };

  const mockBucketService = {
    getPublicFileUrl: vi.fn(),
  };

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        TelegramAuthService,
        TelegramBotClient,
        TelegramPostComposerService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: BucketService,
          useValue: mockBucketService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
      ],
    }).compile();

    service = testingModule.get<TelegramService>(TelegramService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.S3_PUBLIC_BASE_URL;
    delete process.env.MAIN_CHANNEL_ID;
    delete process.env.APP_BASE_URL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send the correct HTTP request', async () => {
      const chat_id = 12345;
      const text = 'Hello, World!';
      const mockMessage: TGMessage = {
        message_id: 1,
        date: Date.now(),
        chat: { id: chat_id, type: 'private' },
        text,
      };

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: mockMessage,
          },
        }),
      );

      const result = await service.sendMessage({ chat_id, text });

      expect(mockHttpService.post).toHaveBeenCalledWith('sendMessage', {
        chat_id,
        text,
      });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('publishWeeklyDigestToMainChannel', () => {
    beforeEach(() => {
      process.env.MAIN_CHANNEL_ID = '-1001';
    });

    it('should send English empty-week notice when there are no gigs', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const sendMessageSpy = vi.spyOn(bot, 'sendMessage').mockResolvedValue({
        message_id: 1,
        date: 1,
        chat: { id: -1001, type: 'channel' },
      });

      await expect(
        service.publishWeeklyDigestToMainChannel([]),
      ).resolves.toEqual({
        postUrl: 'https://t.me/c/1/1',
      });

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chat_id: '-1001',
        text: WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
      });
    });

    it('should send sendMediaGroup when two posters resolve from bucket URLs', async () => {
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );

      mockHttpService.post.mockImplementation((method: string) => {
        if (method === 'sendMediaGroup') {
          return of({
            data: {
              result: [
                {
                  message_id: 1,
                  date: 1,
                  chat: { id: -1001, type: 'channel' },
                },
              ],
            },
          });
        }
        return of({
          data: {
            result: {
              message_id: 2,
              date: 1,
              chat: { id: -1001, type: 'channel' },
            },
          },
        });
      });

      const gigs = [
        {
          _id: 'a',
          title: 'Alpha',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
        {
          _id: 'b',
          title: 'Beta',
          date: 20,
          posts: [],
          poster: { bucketPath: 'gigs/b.jpg' },
        },
      ] as unknown as GigDocument[];

      await expect(
        service.publishWeeklyDigestToMainChannel(gigs),
      ).resolves.toEqual({
        postUrl: 'https://t.me/c/1/1',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'sendMediaGroup',
        expect.objectContaining({
          chat_id: '-1001',
          media: [
            expect.objectContaining({
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/poster.jpg',
              caption: expect.stringMatching(/Alpha/s),
            }),
            expect.objectContaining({
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/poster.jpg',
            }),
          ],
        }),
      );
    });

    it('should send sendPhoto when exactly one poster resolves', async () => {
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/only.jpg',
      );

      mockHttpService.post.mockImplementation((method: string) => {
        if (method === 'sendPhoto') {
          return of({
            data: {
              result: {
                message_id: 3,
                date: 1,
                chat: { id: -1001, type: 'channel' },
              },
            },
          });
        }
        return of({
          data: {
            result: {
              message_id: 1,
              date: 1,
              chat: { id: -1001, type: 'channel' },
            },
          },
        });
      });

      const gigs = [
        {
          _id: 'a',
          title: 'Only',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
      ] as unknown as GigDocument[];

      await expect(
        service.publishWeeklyDigestToMainChannel(gigs),
      ).resolves.toEqual({
        postUrl: 'https://t.me/c/1/3',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'sendPhoto',
        expect.objectContaining({
          chat_id: '-1001',
          photo: 'https://cdn.example/only.jpg',
          caption: expect.stringMatching(/Only/s),
        }),
      );
    });

    it('should return undefined and not call Telegram when MAIN_CHANNEL_ID is unset', async () => {
      delete process.env.MAIN_CHANNEL_ID;

      const bot = testingModule.get(TelegramBotClient);
      const sendMessageSpy = vi.spyOn(bot, 'sendMessage');

      await expect(
        service.publishWeeklyDigestToMainChannel([]),
      ).resolves.toBeUndefined();

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateModerationPostAfterGigPublished', () => {
    it('should edit moderation caption with stable gig permalink', async () => {
      process.env.APP_BASE_URL = 'https://app.example';
      process.env.EDIT_GIG_URL = 'https://app.example/edit';

      const bot = testingModule.get(TelegramBotClient);
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue({
          message_id: 42,
          date: 1,
          chat: { id: -100123, type: 'channel' },
        });

      await service.updateModerationPostAfterGigPublished({
        gigId: '507f1f77bcf86cd799439011',
        title: 'Radiohead',
        publicId: 'radiohead-barcelona-2026-06-12',
        moderationPost: {
          chatId: -100123,
          messageId: 42,
        },
        publishPost: {
          chatId: -100456,
          messageId: 77,
        },
      });

      expect(editMessageCaptionSpy).toHaveBeenCalledWith({
        chatId: -100123,
        messageId: 42,
        caption: expect.stringContaining(
          '<a href="https://app.example/gigs/radiohead-barcelona-2026-06-12">Radiohead</a>',
        ),
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '✏️ Edit',
                url: 'https://app.example/edit?startapp=radiohead-barcelona-2026-06-12',
              },
            ],
          ],
        },
      });
    });
  });

  describe('updatePublishedSubmissionFeedback', () => {
    it('should edit feedback caption with textual gig link and no reply markup', async () => {
      process.env.APP_BASE_URL = 'https://app.example';

      const bot = testingModule.get(TelegramBotClient);
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue({
          message_id: 99,
          date: 1,
          chat: { id: 12345, type: 'private' },
        });

      await service.updatePublishedSubmissionFeedback({
        gig: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          publicId: 'radiohead-barcelona-2026-06-12',
          title: 'Radiohead',
          date: new Date('2026-06-12T12:00:00.000Z').getTime(),
          city: 'barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          status: Status.Published,
          suggestedBy: {
            userId: 12345,
            feedbackMessageId: 99,
          },
          posts: [],
        } as PlainGig,
      });

      expect(editMessageCaptionSpy).toHaveBeenCalledWith({
        chatId: 12345,
        messageId: 99,
        caption: expect.stringContaining(
          '<a href="https://app.example/gigs/radiohead-barcelona-2026-06-12">Radiohead</a>',
        ),
        parseMode: TGParseMode.HTML,
      });
    });
  });

  describe('editModerationPost', () => {
    it('should keep rejected moderation post in rejected state after edit', async () => {
      process.env.EDIT_GIG_URL = 'https://app.example/edit';

      const bot = testingModule.get(TelegramBotClient);
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue({
          message_id: 42,
          date: 1,
          chat: { id: -100123, type: 'channel' },
        });

      await service.editModerationPost({
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        publicId: 'radiohead-barcelona-2026-06-12',
        title: 'Radiohead',
        date: new Date('2026-06-12T12:00:00.000Z').getTime(),
        city: 'barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        status: Status.Rejected,
        suggestedBy: {
          userId: 12345,
        },
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: -100123,
            id: 42,
            fileId: 'photo-file-id',
            date: 1_780_000_000_000,
          },
        ],
      } as PlainGig);

      expect(editMessageCaptionSpy).toHaveBeenCalledWith({
        chatId: -100123,
        messageId: 42,
        caption: expect.stringContaining('Rejected'),
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '✏️ Edit',
                url: 'https://app.example/edit?startapp=radiohead-barcelona-2026-06-12',
              },
            ],
          ],
        },
      });
    });
  });

  describe('handlePostReject', () => {
    it('should edit moderation caption to rejected state and keep edit button', async () => {
      process.env.EDIT_GIG_URL = 'https://app.example/edit';

      const bot = testingModule.get(TelegramBotClient);
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue({
          message_id: 99,
          date: 1,
          chat: { id: -100123, type: 'channel' },
        });

      await service.handlePostReject({
        gig: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          publicId: 'radiohead-barcelona-2026-06-12',
          title: 'Radiohead',
          date: new Date('2026-06-12T12:00:00.000Z').getTime(),
          city: 'barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          status: Status.Rejected,
          suggestedBy: {
            userId: 12345,
          },
          posts: [],
        } as PlainGig,
        moderationMessage: {
          chatId: -100123,
          messageId: 99,
        },
      });

      expect(editMessageCaptionSpy).toHaveBeenCalledWith({
        chatId: -100123,
        messageId: 99,
        caption: expect.stringContaining('🔴 Rejected'),
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '✏️ Edit',
                url: expect.stringContaining('radiohead-barcelona-2026-06-12'),
              },
            ],
          ],
        },
      });
    });
  });
});
