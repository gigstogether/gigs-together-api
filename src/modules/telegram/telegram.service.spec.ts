import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { of } from 'rxjs';
import type { TGMessage } from './types/message.types';
import type { GigPost, PlainGig } from '../gig/types/gig.types';
import { BucketService } from '../bucket/bucket.service';
import { TelegramService } from './telegram.service';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import type { TelegramTemplateKey } from './telegram-template-keys';
import type { PlainTemplateParams } from './telegram-template.service';
import { TelegramTemplateService } from './telegram-template.service';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import { PostEditKind } from './types/telegram-post-composer.service.types';
import { RemoteImageService } from '../remote-image/remote-image.service';

type MockPostTemplates = Pick<TelegramTemplateService, 'getText' | 'render'>;

function renderPlainTemplate(
  template: string,
  params: PlainTemplateParams,
): string {
  return template.replace(/\{(\w+)\}/g, (match, rawKey: string) => {
    const value = params[rawKey];
    if (value === null || value === undefined) {
      return match;
    }
    return String(value);
  });
}

function createMockPostTemplates(): MockPostTemplates {
  const texts: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty]:
      'There are no gigs scheduled for this week.',
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestHeader]:
      "Here's what is happening this week:",
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestFooter]: 'See you at the gigs!',
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestTicketsLabel]: 'Tickets',
    [TELEGRAM_TEMPLATE_KEYS.buttonApprove]: '✅ Approve',
    [TELEGRAM_TEMPLATE_KEYS.buttonEdit]: '✏️ Edit',
    [TELEGRAM_TEMPLATE_KEYS.buttonHide]: '🙈 Hide',
    [TELEGRAM_TEMPLATE_KEYS.buttonReject]: '❌ Reject',
    [TELEGRAM_TEMPLATE_KEYS.buttonPost]: '📢 Post',
    [TELEGRAM_TEMPLATE_KEYS.buttonShow]: '👁 Show',
    [TELEGRAM_TEMPLATE_KEYS.buttonSendToModeration]: '➡️ Send to moderation',
  };

  const templates: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.mainGigWithLink]:
      '<a href="{url}">{title}</a>\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.mainGigWithoutLink]:
      '{title}\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackSubmitted]:
      'Suggestion {title} submitted',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedForModeration]:
      'Suggestion {title} accepted for moderation',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackRejected]:
      'Suggestion {title} rejected',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedWithPublicLink]:
      'Suggestion accepted: <a href="{gigUrl}">open gig</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkOpenAdmin]:
      '<a href="{url}">Open gig candidate in admin</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkSeeModerationPost]:
      '<a href="{url}">See moderation post</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigLinkOpenAdmin]:
      '<a href="{url}">Open gig in admin</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigLinkSeeMainPost]:
      '<a href="{url}">See main post</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigTitleWithLink]: '<a href="{url}">{title}</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigTitleWithoutLink]: '{title}',
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestTicketsLink]:
      '<a href="{url}">{ticketsLabel}</a>',
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestGigLineHtml]:
      '{titleLine}\n{dates}\n{venue} • {ticketsLine}',
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestGigLinePlain]:
      '{title}\n{dates}\n{venue} • {ticketsLabel}',
  };

  return {
    getText: vi.fn((key: TelegramTemplateKey) => texts[key] ?? ''),
    render: vi.fn((key: TelegramTemplateKey, params: PlainTemplateParams) => {
      const template = templates[key];
      if (template === undefined) {
        return '';
      }
      return renderPlainTemplate(template, params);
    }),
  };
}

function createDigestUpstreamError(
  description = 'Bad Request: failed to send message #2 with the error message "WEBPAGE_CURL_FAILED"',
): unknown {
  return {
    isAxiosError: true,
    code: 'ERR_BAD_REQUEST',
    message: 'Request failed with status code 400',
    config: {
      method: 'post',
      url: 'sendMediaGroup',
      baseURL: 'https://api.telegram.org/bot-secret-token',
    },
    response: {
      status: 400,
      data: {
        ok: false,
        error_code: 400,
        description,
      },
    },
  };
}

function createDigestGigsWithRemotePosters(): PlainGig[] {
  return [
    {
      id: 'a',
      publicId: 'alpha-2026-01-01',
      title: 'Alpha',
      date: 10,
      posts: [],
      poster: { bucketPath: 'gigs/a.jpg' },
    },
    {
      id: 'b',
      publicId: 'beta-2026-01-02',
      title: 'Beta',
      date: 20,
      posts: [],
      poster: { bucketPath: 'gigs/b.jpg' },
    },
  ] as unknown as PlainGig[];
}

function createGigForTelegramEdit(post: GigPost): PlainGig {
  return {
    id: '507f1f77bcf86cd799439011',
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: new Date('2026-06-12T12:00:00.000Z').getTime(),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    isVisible: false,
    version: 4,
    source: {
      type: 'user',
      userId: '507f1f77bcf86cd799439012',
      origin: { type: 'admin' },
    },
    posts: [post],
    createdAt: new Date('2026-05-30T14:22:00.000Z'),
    updatedAt: new Date('2026-05-30T14:22:00.000Z'),
  };
}

describe('TelegramService', () => {
  let service: TelegramService;
  let testingModule: TestingModule;
  let mockPostTemplates: MockPostTemplates;

  const mockHttpService = {
    post: vi.fn(),
    get: vi.fn(),
  };

  const mockChatLookupCache = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    reset: vi.fn(),
  };

  const mockBucketService = {
    getPublicFileUrl: vi.fn(),
  };

  const mockRemoteImageService = {
    download: vi.fn(),
  };

  beforeEach(async () => {
    mockPostTemplates = createMockPostTemplates();

    testingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        TelegramBotClient,
        TelegramPostComposerService,
        {
          provide: TelegramTemplateService,
          useValue: mockPostTemplates,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: BucketService,
          useValue: mockBucketService,
        },
        {
          provide: RemoteImageService,
          useValue: mockRemoteImageService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockChatLookupCache,
        },
      ],
    }).compile();

    service = testingModule.get<TelegramService>(TelegramService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockRemoteImageService.download.mockReset();
    vi.clearAllMocks();
    delete process.env.S3_PUBLIC_BASE_URL;
    delete process.env.MAIN_CHANNEL_ID;
    delete process.env.INTAKE_CHANNEL_ID;
    delete process.env.MODERATION_CHANNEL_ID;
    delete process.env.EDIT_GIG_URL;
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

  describe('sendWeeklyDigestPost', () => {
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

      await expect(service.sendWeeklyDigestPost([])).resolves.toEqual({
        postUrl: 'https://t.me/c/1/1',
      });

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chat_id: '-1001',
        text: mockPostTemplates.getText(
          TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty,
        ),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
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
          id: 'a',
          title: 'Alpha',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
        {
          id: 'b',
          title: 'Beta',
          date: 20,
          posts: [],
          poster: { bucketPath: 'gigs/b.jpg' },
        },
      ] as unknown as PlainGig[];

      await expect(service.sendWeeklyDigestPost(gigs)).resolves.toEqual({
        postUrl: 'https://t.me/c/1/1',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'sendMediaGroup',
        expect.objectContaining({
          chat_id: '-1001',
          media: [
            expect.objectContaining({
              type: TGInputMediaType.Photo,
              media: expect.stringMatching(
                /^https:\/\/cdn\.example\/poster\.jpg\?tgcb=\d+$/,
              ),
              caption: expect.stringMatching(/Alpha/s),
            }),
            expect.objectContaining({
              type: TGInputMediaType.Photo,
              media: expect.stringMatching(
                /^https:\/\/cdn\.example\/poster\.jpg\?tgcb=\d+$/,
              ),
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
          id: 'a',
          title: 'Only',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
      ] as unknown as PlainGig[];

      await expect(service.sendWeeklyDigestPost(gigs)).resolves.toEqual({
        postUrl: 'https://t.me/c/1/3',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'sendPhoto',
        expect.objectContaining({
          chat_id: '-1001',
          photo: expect.stringMatching(
            /^https:\/\/cdn\.example\/only\.jpg\?tgcb=\d+$/,
          ),
          caption: expect.stringMatching(/Only/s),
        }),
      );
    });

    it('should return undefined and not call Telegram when MAIN_CHANNEL_ID is unset', async () => {
      delete process.env.MAIN_CHANNEL_ID;

      const bot = testingModule.get(TelegramBotClient);
      const sendMessageSpy = vi.spyOn(bot, 'sendMessage');

      await expect(service.sendWeeklyDigestPost([])).resolves.toBeUndefined();

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    it('should replace an upstream Axios error before it reaches the scheduler', async () => {
      const bot = testingModule.get(TelegramBotClient);
      vi.spyOn(bot, 'sendMediaGroup').mockRejectedValue(
        createDigestUpstreamError(),
      );
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );

      const result = service.sendWeeklyDigestPost(
        createDigestGigsWithRemotePosters(),
      );

      await expect(result).rejects.toThrow(
        'Weekly digest send to main channel failed',
      );
    });

    it('should omit the Telegram token from the digest failure log', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const loggerErrorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.spyOn(bot, 'sendMediaGroup').mockRejectedValue(
        createDigestUpstreamError(),
      );
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );

      await expect(
        service.sendWeeklyDigestPost(createDigestGigsWithRemotePosters()),
      ).rejects.toThrow('Weekly digest send to main channel failed');

      expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain(
        'secret-token',
      );
    });

    it('should log the failed digest poster without URL query data', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const loggerErrorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.spyOn(bot, 'sendMediaGroup').mockRejectedValue(
        createDigestUpstreamError(),
      );
      mockBucketService.getPublicFileUrl
        .mockReturnValueOnce(
          'https://cdn.example/posters/alpha.jpg?signature=alpha-secret',
        )
        .mockReturnValueOnce(
          'https://cdn.example/posters/beta.jpg?signature=beta-secret',
        );

      await expect(
        service.sendWeeklyDigestPost(createDigestGigsWithRemotePosters()),
      ).rejects.toThrow('Weekly digest send to main channel failed');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: {
            telegramError: 'WEBPAGE_CURL_FAILED',
            position: 2,
            publicId: 'beta-2026-01-02',
            posterUrl: 'https://cdn.example/posters/beta.jpg',
          },
        }),
      );
      expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain(
        'beta-secret',
      );
    });

    it('should not map a digest poster when the Telegram description format differs', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const loggerErrorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.spyOn(bot, 'sendMediaGroup').mockRejectedValue(
        createDigestUpstreamError('Bad Request: WEBPAGE_CURL_FAILED'),
      );
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );

      await expect(
        service.sendWeeklyDigestPost(createDigestGigsWithRemotePosters()),
      ).rejects.toThrow('Weekly digest send to main channel failed');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.not.objectContaining({ meta: expect.anything() }),
      );
    });
  });

  describe('editGigPost', () => {
    it('should return a caption edit result for a photo post', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const message: TGMessage = {
        message_id: 99,
        date: 1,
        chat: { id: -100456, type: 'channel' },
      };
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue(message);
      const mainPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        date: 1_700_000_002_000,
        id: 99,
        chatId: -100456,
        fileId: 'existing-file-id',
      };
      const gig = createGigForTelegramEdit(mainPost);

      await expect(
        service.editGigPost({
          gig,
          post: mainPost,
          isMediaUpdateRequired: false,
        }),
      ).resolves.toEqual({
        kind: PostEditKind.Caption,
        message,
      });
      expect(editMessageCaptionSpy).toHaveBeenCalledOnce();
    });

    it('should return a text edit result for a text post', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const message: TGMessage = {
        message_id: 99,
        date: 1,
        chat: { id: -100456, type: 'channel' },
        text: 'Radiohead',
      };
      const editMessageTextSpy = vi
        .spyOn(bot, 'editMessageText')
        .mockResolvedValue(message);
      const mainPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        date: 1_700_000_002_000,
        id: 99,
        chatId: -100456,
      };
      const gig = createGigForTelegramEdit(mainPost);

      await expect(
        service.editGigPost({
          gig,
          post: mainPost,
          isMediaUpdateRequired: false,
        }),
      ).resolves.toEqual({
        kind: PostEditKind.Text,
        message,
      });
      expect(editMessageTextSpy).toHaveBeenCalledOnce();
    });

    it('should edit the provided Moderation post', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const message: TGMessage = {
        message_id: 42,
        date: 1,
        chat: { id: -100123, type: 'channel' },
      };
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue(message);
      const moderationPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 42,
        chatId: -100123,
        fileId: 'existing-file-id',
      };
      const gig = createGigForTelegramEdit(moderationPost);

      await expect(
        service.editGigPost({
          gig,
          post: moderationPost,
          isMediaUpdateRequired: false,
        }),
      ).resolves.toEqual({
        kind: PostEditKind.Caption,
        message,
      });
      expect(editMessageCaptionSpy).toHaveBeenCalledOnce();
    });

    it('should reject an Intake post for a Gig', () => {
      const intakePost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1_700_000_001_000,
        id: 42,
        chatId: -100123,
      };
      const gig = createGigForTelegramEdit(intakePost);

      expect(() =>
        service.editGigPost({
          gig,
          post: intakePost,
          isMediaUpdateRequired: false,
        }),
      ).toThrow('Cannot edit an intake post for a Gig');
    });
  });

  describe('editGigPostsBestEffort', () => {
    it('should keep compact Moderation shape and reuse its fileId for Main after poster update', async () => {
      process.env.APP_BASE_URL = 'https://app.example';
      process.env.EDIT_GIG_URL = 'https://app.example/edit';
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      const bot = testingModule.get(TelegramBotClient);
      const moderationPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 42,
        chatId: -100123,
        fileId: 'old-moderation-file-id',
      };
      const mainPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        date: 1_700_000_002_000,
        id: 99,
        chatId: -100456,
        fileId: 'old-main-file-id',
      };
      const gig = {
        ...createGigForTelegramEdit(moderationPost),
        poster: { bucketPath: 'gigs/poster.jpg' },
        posts: [moderationPost, mainPost],
      };
      const posterFile = {
        buffer: Buffer.from('poster bytes'),
        filename: 'poster.jpg',
        contentType: 'image/jpeg',
      };
      const moderationMessage: TGMessage = {
        message_id: moderationPost.id,
        date: 1_700_000_003,
        chat: { id: moderationPost.chatId, type: 'channel' },
        photo: [
          {
            file_id: 'new-moderation-file-id',
            file_unique_id: 'new-moderation-unique-id',
            width: 800,
            height: 800,
          },
        ],
      };
      const mainMessage: TGMessage = {
        message_id: mainPost.id,
        date: 1_700_000_004,
        chat: { id: mainPost.chatId, type: 'channel' },
        photo: [
          {
            file_id: 'new-main-file-id',
            file_unique_id: 'new-main-unique-id',
            width: 800,
            height: 800,
          },
        ],
      };
      const editMessageMediaSpy = vi
        .spyOn(bot, 'editMessageMedia')
        .mockResolvedValueOnce(moderationMessage)
        .mockResolvedValueOnce(mainMessage);

      await expect(
        service.editGigPostsBestEffort({
          gig,
          isMediaUpdateRequired: true,
          posterFile,
        }),
      ).resolves.toEqual({
        moderation: {
          post: moderationPost,
          result: {
            kind: PostEditKind.Media,
            message: moderationMessage,
            fileId: 'new-moderation-file-id',
          },
        },
        main: {
          post: mainPost,
          result: {
            kind: PostEditKind.Media,
            message: mainMessage,
            fileId: 'new-main-file-id',
          },
        },
      });
      expect(editMessageMediaSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          chatId: moderationPost.chatId,
          messageId: moderationPost.id,
          media: expect.objectContaining({
            media: expect.stringMatching(
              /^https:\/\/cdn\.example\/poster\.jpg\?tgcb=\d+$/,
            ),
            caption:
              '<a href="https://app.example/gigs/radiohead-barcelona-2026-06-12">Radiohead</a>\n\n<a href="https://app.example/edit?startapp=openGig-radiohead-barcelona-2026-06-12">Open gig in admin</a> | <a href="https://t.me/c/456/99">See main post</a>',
          }),
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: '✏️ Edit',
                  url: 'https://app.example/edit?startapp=editGig-radiohead-barcelona-2026-06-12',
                },
                expect.objectContaining({ text: '👁 Show' }),
              ],
            ],
          },
        }),
        posterFile,
      );
      expect(editMessageMediaSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          chatId: mainPost.chatId,
          messageId: mainPost.id,
          media: expect.objectContaining({
            media: 'new-moderation-file-id',
          }),
        }),
      );
    });

    it('should retry Main with the same file and refresh Moderation text when its media edit fails', async () => {
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      const bot = testingModule.get(TelegramBotClient);
      const moderationPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_001_000,
        id: 42,
        chatId: -100123,
        fileId: 'old-moderation-file-id',
      };
      const mainPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        date: 1_700_000_002_000,
        id: 99,
        chatId: -100456,
        fileId: 'old-main-file-id',
      };
      const gig = {
        ...createGigForTelegramEdit(moderationPost),
        poster: { bucketPath: 'gigs/poster.jpg' },
        posts: [moderationPost, mainPost],
      };
      const posterFile = {
        buffer: Buffer.from('poster bytes'),
        filename: 'poster.jpg',
        contentType: 'image/jpeg',
      };
      const mainMessage: TGMessage = {
        message_id: mainPost.id,
        date: 1_700_000_004,
        chat: { id: mainPost.chatId, type: 'channel' },
        photo: [
          {
            file_id: 'new-main-file-id',
            file_unique_id: 'new-main-unique-id',
            width: 800,
            height: 800,
          },
        ],
      };
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const editMessageMediaSpy = vi
        .spyOn(bot, 'editMessageMedia')
        .mockRejectedValueOnce({
          isAxiosError: true,
          message: 'Request failed with status code 400',
          response: {
            status: 400,
            data: {
              ok: false,
              error_code: 400,
              description: 'Bad Request: failed to get HTTP URL content',
            },
          },
        })
        .mockResolvedValueOnce(mainMessage);
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue({
          message_id: moderationPost.id,
          date: 1_700_000_005,
          chat: { id: moderationPost.chatId, type: 'channel' },
        });

      await expect(
        service.editGigPostsBestEffort({
          gig,
          isMediaUpdateRequired: true,
          posterFile,
        }),
      ).resolves.toEqual({
        main: {
          post: mainPost,
          result: {
            kind: PostEditKind.Media,
            message: mainMessage,
            fileId: 'new-main-file-id',
          },
        },
      });
      expect(editMessageMediaSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          chatId: mainPost.chatId,
          messageId: mainPost.id,
          media: expect.objectContaining({
            media: expect.stringMatching(
              /^https:\/\/cdn\.example\/poster\.jpg\?tgcb=\d+$/,
            ),
          }),
        }),
        posterFile,
      );
      expect(editMessageCaptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: moderationPost.chatId,
          messageId: moderationPost.id,
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        `Telegram post update failed for publicId=${gig.publicId} postType=${PostType.Moderation}: Request failed with status code 400; httpStatus=400; telegramErrorCode=400; telegramDescription=Bad Request: failed to get HTTP URL content`,
      );
    });
  });

  describe('sendMainPost', () => {
    it('should return normalized Telegram post metadata', async () => {
      process.env.MAIN_CHANNEL_ID = '-100456';
      const bot = testingModule.get(TelegramBotClient);
      vi.spyOn(bot, 'sendPhoto').mockResolvedValue({
        message_id: 99,
        date: 1_700_000_003,
        chat: { id: -100456, type: 'channel' },
        photo: [
          {
            file_id: 'small-file-id',
            file_unique_id: 'small-unique-id',
            width: 90,
            height: 90,
            file_size: 1_000,
          },
          {
            file_id: 'new-file-id',
            file_unique_id: 'new-unique-id',
            width: 800,
            height: 800,
            file_size: 100_000,
          },
        ],
      });
      const gig = createGigForTelegramEdit({
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_002_000,
        id: 42,
        chatId: -100123,
        fileId: 'existing-file-id',
      });

      await expect(service.sendMainPost(gig)).resolves.toEqual({
        messageId: 99,
        chatId: -100456,
        sentAtSeconds: 1_700_000_003,
        fileId: 'new-file-id',
      });
    });

    it('should reject incomplete Telegram post metadata', async () => {
      process.env.MAIN_CHANNEL_ID = '-100456';
      const bot = testingModule.get(TelegramBotClient);
      vi.spyOn(bot, 'sendPhoto').mockResolvedValue({
        message_id: Number.NaN,
        date: 1_700_000_003,
        chat: { id: -100456, type: 'channel' },
      });
      const gig = createGigForTelegramEdit({
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1_700_000_002_000,
        id: 42,
        chatId: -100123,
        fileId: 'existing-file-id',
      });

      await expect(service.sendMainPost(gig)).rejects.toThrow(
        'Telegram sent post reference is incomplete',
      );
    });
  });

  describe('sendGigCandidateIntakePost', () => {
    it('should send a text post when GigCandidate has no poster', async () => {
      process.env.INTAKE_CHANNEL_ID = '-100';
      process.env.EDIT_GIG_URL = 'https://app.example/edit';
      const bot = testingModule.get(TelegramBotClient);
      const sendMessageSpy = vi.spyOn(bot, 'sendMessage').mockResolvedValue({
        message_id: 40,
        date: 1_700_000_000,
        chat: { id: -100, type: 'channel' },
      });
      const sendPhotoSpy = vi.spyOn(bot, 'sendPhoto');
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Band',
          date: 1_700_000_000_000,
          city: 'Barcelona',
          country: 'ES',
        },
        version: 0,
        status: GigCandidateStatus.New,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        service.sendGigCandidateIntakePost(gigCandidate),
      ).resolves.toEqual({
        messageId: 40,
        chatId: -100,
        sentAtSeconds: 1_700_000_000,
      });
      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: '-100',
          text: expect.stringContaining('Band'),
        }),
      );
      expect(sendPhotoSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendGigCandidateModerationPost', () => {
    it('should send a prepared poster file without asking Telegram to download its URL', async () => {
      process.env.MODERATION_CHANNEL_ID = '-200';
      process.env.EDIT_GIG_URL = 'https://app.example/edit';
      const bot = testingModule.get(TelegramBotClient);
      const posterFile = {
        buffer: Buffer.from('poster bytes'),
        filename: 'poster.jpg',
        contentType: 'image/jpeg',
      };
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'admin' },
        },
        gigDraft: {
          title: 'Band',
          date: 1_700_000_000_000,
          city: 'Barcelona',
          country: 'ES',
          poster: { externalUrl: 'https://cdn.example/poster.jpg' },
        },
        version: 0,
        status: GigCandidateStatus.Reviewing,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Intake,
            date: 1_700_000_000_000,
            id: 40,
            chatId: -100,
            fileId: 'existing-intake-file-id',
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const sendPhotoSpy = vi.spyOn(bot, 'sendPhoto').mockResolvedValue({
        message_id: 50,
        date: 1_700_000_001,
        chat: { id: -200, type: 'channel' },
        photo: [
          {
            file_id: 'new-file-id',
            file_unique_id: 'new-unique-id',
            width: 800,
            height: 800,
          },
        ],
      });

      await expect(
        service.sendGigCandidateModerationPost(gigCandidate, posterFile),
      ).resolves.toEqual({
        messageId: 50,
        chatId: -200,
        sentAtSeconds: 1_700_000_001,
        fileId: 'new-file-id',
      });
      expect(sendPhotoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: '-200',
          photo: posterFile,
        }),
        gigCandidate.id,
      );
    });

    it('should reuse the Intake photo fileId when the original file is unavailable', async () => {
      process.env.MODERATION_CHANNEL_ID = '-200';
      process.env.EDIT_GIG_URL = 'https://app.example/edit';
      const bot = testingModule.get(TelegramBotClient);
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Band',
          date: 1_700_000_000_000,
          city: 'Barcelona',
          country: 'ES',
          poster: { externalUrl: 'https://cdn.example/poster.jpg' },
        },
        version: 2,
        status: GigCandidateStatus.Reviewing,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Intake,
            date: 1_700_000_000_000,
            id: 40,
            chatId: -100,
            fileId: 'intake-file-id',
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const sendPhotoSpy = vi.spyOn(bot, 'sendPhoto').mockResolvedValue({
        message_id: 50,
        date: 1_700_000_001,
        chat: { id: -200, type: 'channel' },
        photo: [
          {
            file_id: 'moderation-file-id',
            file_unique_id: 'moderation-unique-id',
            width: 800,
            height: 800,
          },
        ],
      });

      await service.sendGigCandidateModerationPost(gigCandidate);

      expect(sendPhotoSpy).toHaveBeenCalledWith(
        expect.objectContaining({ photo: 'intake-file-id' }),
        gigCandidate.id,
      );
    });

    it('should fall back to the poster URL when the Intake post is text', async () => {
      process.env.MODERATION_CHANNEL_ID = '-200';
      process.env.EDIT_GIG_URL = 'https://app.example/edit';
      const bot = testingModule.get(TelegramBotClient);
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Band',
          date: 1_700_000_000_000,
          city: 'Barcelona',
          country: 'ES',
          poster: { externalUrl: 'https://cdn.example/poster.jpg' },
        },
        version: 2,
        status: GigCandidateStatus.Reviewing,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Intake,
            date: 1_700_000_000_000,
            id: 40,
            chatId: -100,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const sendPhotoSpy = vi.spyOn(bot, 'sendPhoto').mockResolvedValue({
        message_id: 50,
        date: 1_700_000_001,
        chat: { id: -200, type: 'channel' },
        photo: [
          {
            file_id: 'moderation-file-id',
            file_unique_id: 'moderation-unique-id',
            width: 800,
            height: 800,
          },
        ],
      });

      await service.sendGigCandidateModerationPost(gigCandidate);

      expect(sendPhotoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          photo: 'https://cdn.example/poster.jpg',
        }),
        gigCandidate.id,
      );
    });

    it('should reject a successful photo response without fileId', async () => {
      process.env.MODERATION_CHANNEL_ID = '-200';
      process.env.EDIT_GIG_URL = 'https://app.example/edit';
      const bot = testingModule.get(TelegramBotClient);
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Band',
          date: 1_700_000_000_000,
          city: 'Barcelona',
          country: 'ES',
          poster: { externalUrl: 'https://cdn.example/poster.jpg' },
        },
        version: 2,
        status: GigCandidateStatus.Reviewing,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.spyOn(bot, 'sendPhoto').mockResolvedValue({
        message_id: 50,
        date: 1_700_000_001,
        chat: { id: -200, type: 'channel' },
      });

      await expect(
        service.sendGigCandidateModerationPost(gigCandidate),
      ).rejects.toThrow('Telegram photo response has no fileId');
    });
  });

  describe('updateGigModerationPost with main post', () => {
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

      await service.updateGigModerationPost({
        gigId: '507f1f77bcf86cd799439011',
        expectedVersion: 7,
        isVisible: true,
        title: 'Radiohead',
        publicId: 'radiohead-barcelona-2026-06-12',
        moderationPost: {
          chatId: -100123,
          messageId: 42,
        },
        mainPost: {
          chatId: -100456,
          messageId: 77,
        },
      });

      const editMessageCaptionPayload =
        editMessageCaptionSpy.mock.calls[0]?.[0];

      expect(editMessageCaptionPayload?.caption).toContain(
        '<a href="https://app.example/gigs/radiohead-barcelona-2026-06-12">Radiohead</a>',
      );
      expect(editMessageCaptionPayload?.caption).toContain(
        '<a href="https://app.example/edit?startapp=openGig-radiohead-barcelona-2026-06-12">Open gig in admin</a>',
      );
      expect(editMessageCaptionSpy).toHaveBeenCalledWith({
        chatId: -100123,
        messageId: 42,
        caption: expect.any(String),
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '✏️ Edit',
                url: 'https://app.example/edit?startapp=editGig-radiohead-barcelona-2026-06-12',
              },
              expect.objectContaining({ text: '🙈 Hide' }),
            ],
          ],
        },
      });
    });
  });

  describe('updateGigModerationPost without main post', () => {
    it('should keep Post, Edit and Hide controls without a Main post', async () => {
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

      await service.updateGigModerationPost({
        gigId: '507f1f77bcf86cd799439011',
        expectedVersion: 8,
        isVisible: true,
        title: 'Radiohead',
        publicId: 'radiohead-barcelona-2026-06-12',
        moderationPost: { chatId: -100123, messageId: 42 },
      });

      expect(editMessageCaptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          replyMarkup: {
            inline_keyboard: [
              [
                expect.objectContaining({ text: '📢 Post' }),
                expect.objectContaining({ text: '✏️ Edit' }),
                expect.objectContaining({ text: '🙈 Hide' }),
              ],
            ],
          },
        }),
      );
    });
  });

  describe('GigCandidate lifecycle messages', () => {
    beforeEach(() => {
      process.env.EDIT_GIG_URL = 'https://app.example/edit';
    });

    it('should send newly composed feedback as a direct message', async () => {
      const bot = testingModule.get(TelegramBotClient);
      const sendMessageSpy = vi.spyOn(bot, 'sendMessage').mockResolvedValue({
        message_id: 90,
        date: 1,
        chat: { id: 42, type: 'private' },
      });

      await service.sendGigCandidateFeedback({
        chatId: '42',
        kind: 'submitted',
        title: 'Band',
      });

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chat_id: '42',
        text: 'Suggestion Band submitted',
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: false,
      });
    });

    it('should update a rejected channel post and remove its actions', async () => {
      vi.stubEnv('APP_BASE_URL', 'https://app.example');
      const bot = testingModule.get(TelegramBotClient);
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue({
          message_id: 50,
          date: 1,
          chat: { id: -200, type: 'channel' },
        });
      const post: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 1,
        id: 50,
        chatId: -200,
      };
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Suggested Band',
          date: 1,
          city: 'Barcelona',
          country: 'ES',
        },
        version: 1,
        status: GigCandidateStatus.Rejected,
        posts: [post],
        rejectedAt: new Date(),
        rejectedByUserId: '66a000000000000000000000043',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await service.updateRejectedGigCandidatePost({ gigCandidate, post });

      expect(editMessageCaptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: -200,
          messageId: 50,
          caption: expect.stringContaining('🔴 Suggested Band'),
          replyMarkup: { inline_keyboard: [] },
        }),
      );
    });

    it('should update Intake with handoff links and remove its actions', async () => {
      process.env.APP_BASE_URL = 'https://app.example';
      const bot = testingModule.get(TelegramBotClient);
      const editMessageCaptionSpy = vi
        .spyOn(bot, 'editMessageCaption')
        .mockResolvedValue({
          message_id: 40,
          date: 1,
          chat: { id: -1003001, type: 'channel' },
        });
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        fileId: 'intake-file-id',
        date: 1,
        id: 40,
        chatId: -1003001,
      };
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 2,
        id: 50,
        chatId: -1003002,
      };
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Suggested Band',
          date: 1,
          city: 'Barcelona',
          country: 'ES',
        },
        version: 3,
        status: GigCandidateStatus.Reviewing,
        posts: [intakePost, moderationPost],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await service.updateGigCandidateIntakePostAfterModeration({
        gigCandidate,
        intakePost,
        moderationPost,
      });

      expect(editMessageCaptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: -1003001,
          messageId: 40,
          caption: expect.stringContaining(
            '<a href="https://app.example/edit?startapp=openGigCandidate-507f1f77bcf86cd799439099">Open gig candidate in admin</a> | <a href="https://t.me/c/3002/50">See moderation post</a>',
          ),
          replyMarkup: { inline_keyboard: [] },
        }),
      );
    });

    it('should update a text Intake after moderation handoff', async () => {
      process.env.APP_BASE_URL = 'https://app.example';
      const bot = testingModule.get(TelegramBotClient);
      const editMessageTextSpy = vi
        .spyOn(bot, 'editMessageText')
        .mockResolvedValue({
          message_id: 40,
          date: 1,
          chat: { id: -1003001, type: 'channel' },
        });
      const intakePost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Intake,
        date: 1,
        id: 40,
        chatId: -1003001,
      };
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        fileId: 'moderation-file-id',
        date: 2,
        id: 50,
        chatId: -1003002,
      };
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Suggested Band',
          date: 1,
          city: 'Barcelona',
          country: 'ES',
          poster: { bucketPath: 'gigs/default.jpg' },
        },
        version: 3,
        status: GigCandidateStatus.Reviewing,
        posts: [intakePost, moderationPost],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await service.updateGigCandidateIntakePostAfterModeration({
        gigCandidate,
        intakePost,
        moderationPost,
      });

      expect(editMessageTextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: -1003001,
          messageId: 40,
          text: expect.stringContaining('See moderation post'),
          replyMarkup: { inline_keyboard: [] },
        }),
      );
    });

    it('should replace GigCandidate moderation media when requested', async () => {
      mockBucketService.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/gig-candidate.jpg',
      );
      const bot = testingModule.get(TelegramBotClient);
      const editedMessage: TGMessage = {
        message_id: 50,
        date: 1,
        chat: { id: -200, type: 'channel' },
        photo: [
          {
            file_id: 'new-file-id',
            file_unique_id: 'new-unique-id',
            width: 800,
            height: 800,
          },
        ],
      };
      const editMessageMediaSpy = vi
        .spyOn(bot, 'editMessageMedia')
        .mockResolvedValue(editedMessage);
      const posterFile = {
        buffer: Buffer.from('updated poster'),
        filename: 'poster.jpg',
        contentType: 'image/jpeg',
      };
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1,
        id: 50,
        chatId: -200,
        fileId: 'old-file-id',
      };
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Updated Band',
          date: 1,
          city: 'Barcelona',
          country: 'ES',
          poster: { bucketPath: 'gigs/gig-candidate.jpg' },
        },
        version: 4,
        status: GigCandidateStatus.Reviewing,
        posts: [moderationPost],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        service.editGigCandidatePost({
          gigCandidate,
          post: moderationPost,
          isMediaUpdateRequired: true,
          posterFile,
        }),
      ).resolves.toEqual({
        kind: PostEditKind.Media,
        message: editedMessage,
        fileId: 'new-file-id',
      });
      expect(editMessageMediaSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: -200,
          messageId: 50,
          media: expect.objectContaining({
            type: TGInputMediaType.Photo,
            media: expect.stringMatching(
              /^https:\/\/cdn\.example\/gig-candidate\.jpg\?tgcb=\d+$/,
            ),
            caption: expect.stringContaining('🟡 Updated Band'),
          }),
        }),
        posterFile,
      );
    });
  });
});
