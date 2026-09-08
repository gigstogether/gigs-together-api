import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { of } from 'rxjs';
import type { TGMessage } from './types/message.types';
import type { GigDocument } from '../gig/gig.schema';
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
    [TELEGRAM_TEMPLATE_KEYS.statusAccepted]: '🟢 Accepted',
    [TELEGRAM_TEMPLATE_KEYS.buttonApprove]: '✅ Approve',
    [TELEGRAM_TEMPLATE_KEYS.buttonAccept]: '✅ Accept',
    [TELEGRAM_TEMPLATE_KEYS.buttonEdit]: '✏️ Edit',
    [TELEGRAM_TEMPLATE_KEYS.buttonHide]: '🙈 Hide',
    [TELEGRAM_TEMPLATE_KEYS.buttonReject]: '❌ Reject',
    [TELEGRAM_TEMPLATE_KEYS.buttonPost]: '📢 Post',
    [TELEGRAM_TEMPLATE_KEYS.buttonShow]: '👁 Show',
    [TELEGRAM_TEMPLATE_KEYS.buttonSendToModeration]: '➡️ Send to moderation',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedForModeration]:
      'Suggestion accepted for moderation',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackRejected]:
      'Suggestion rejected',
  };

  const templates: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.mainGigWithLink]:
      '<a href="{url}">{title}</a>\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.mainGigWithoutLink]:
      '{title}\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.moderationGig]: '{statusLine}\n\n{body}',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackSubmitted]:
      'Suggestion {title} submitted',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedWithPublicLink]:
      'Suggestion accepted: <a href="{gigUrl}">open gig</a>',
    [TELEGRAM_TEMPLATE_KEYS.moderationLinkSeePost]:
      '<a href="{url}">See post</a>',
    [TELEGRAM_TEMPLATE_KEYS.moderationLinkOpenAdmin]:
      '<a href="{url}">Open in admin</a>',
    [TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithLink]:
      '<a href="{url}">{title}</a>',
    [TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithoutLink]: '{title}',
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
          provide: CACHE_MANAGER,
          useValue: mockChatLookupCache,
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
        '<a href="https://app.example/admin/gigs/radiohead-barcelona-2026-06-12">Open in admin</a>',
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
                url: 'https://app.example/edit?startapp=radiohead-barcelona-2026-06-12',
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
  });
});
