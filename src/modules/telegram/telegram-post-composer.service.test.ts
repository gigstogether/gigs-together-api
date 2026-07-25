import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GigDocument } from '../gig/gig.schema';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { BucketService } from '../bucket/bucket.service';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { TELEGRAM_MEDIA_CAPTION_MAX_CHARS } from './telegram-post-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import type { TelegramTemplateKey } from './telegram-template-keys';
import type { PlainTemplateParams } from './telegram-template.service';
import { TelegramTemplateService } from './telegram-template.service';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import { Action } from './types/action.enum';
import type { BuildGigPermalinkPayload } from './types/telegram-post-composer.service.types';
import { WeeklyDigestMainChannelSendKind } from './types/telegram-post-composer.service.types';

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
    [TELEGRAM_TEMPLATE_KEYS.statusPending]: '🟡 Pending',
    [TELEGRAM_TEMPLATE_KEYS.statusPublished]: '🟢 Published',
    [TELEGRAM_TEMPLATE_KEYS.statusRejected]: '🔴 Rejected',
    [TELEGRAM_TEMPLATE_KEYS.buttonApprove]: '✅ Approve',
    [TELEGRAM_TEMPLATE_KEYS.buttonEdit]: '✏️ Edit',
    [TELEGRAM_TEMPLATE_KEYS.buttonReject]: '❌ Reject',
    [TELEGRAM_TEMPLATE_KEYS.buttonPost]: '📢 Post',
  };

  const templates: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.mainGigWithLink]:
      '<a href="{url}">{title}</a>\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.mainGigWithoutLink]:
      '{title}\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.moderationGig]: '{statusLine}\n\n{body}',
    [TELEGRAM_TEMPLATE_KEYS.moderationStatusLineWithLinks]:
      '{statusLabel} | {statusLinks}',
    [TELEGRAM_TEMPLATE_KEYS.moderationLinkSeePost]:
      '<a href="{url}">See post</a>',
    [TELEGRAM_TEMPLATE_KEYS.moderationLinkOpenAdmin]:
      '<a href="{url}">Open in admin</a>',
    [TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithLink]:
      '<a href="{url}">{title}</a>',
    [TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithoutLink]: '{title}',
    [TELEGRAM_TEMPLATE_KEYS.submissionFeedback]: '{statusLabel}\n\n{body}',
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

describe('TelegramPostComposer', () => {
  let composer: TelegramPostComposerService;
  let mockPostTemplates: MockPostTemplates;

  const mockBucket = {
    getPublicFileUrl: vi.fn(),
  };

  beforeEach(async () => {
    mockPostTemplates = createMockPostTemplates();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramPostComposerService,
        {
          provide: TelegramTemplateService,
          useValue: mockPostTemplates,
        },
        { provide: BucketService, useValue: mockBucket },
      ],
    }).compile();

    composer = moduleRef.get(TelegramPostComposerService);
  });

  describe('pickTgPost', () => {
    it('should return the Telegram post matching type when present', () => {
      const post = {
        to: Messenger.Telegram,
        type: PostType.Publish,
        id: 7,
        chatId: -1001 as const,
        date: 1_700_000_000_000,
      };

      const result = composer.pickTgPost([post], PostType.Publish);

      expect(result).toBe(post);
    });

    it('should return undefined when posts array is missing matching Telegram post', () => {
      expect(composer.pickTgPost(undefined, PostType.Publish)).toBeUndefined();
    });
  });

  describe('getPostUrl', () => {
    it('should build public t.me URL when chatUsername is set', () => {
      const url = composer.getPostUrl({
        chatUsername: 'mychannel',
        messageId: 42,
      });

      expect(url).toBe('https://t.me/mychannel/42');
    });

    it('should build private supergroup URL when only numeric chatId is set', () => {
      const url = composer.getPostUrl({
        chatId: '-1001234567890',
        messageId: 5,
      });

      expect(url).toBe('https://t.me/c/1234567890/5');
    });
  });

  describe('buildAfterPublishModerationReplyMarkup', () => {
    it('should return publish callback and edit URL when main post is not published yet', () => {
      expect(
        composer.buildAfterPublishModerationReplyMarkup({
          gigId: 'gig-a',
          editGigUrl: 'https://app.example/edit?startapp=x',
        }),
      ).toEqual({
        inline_keyboard: [
          [
            {
              text: '📢 Post',
              callback_data: `${Action.Post}:gig-a`,
            },
            { text: '✏️ Edit', url: 'https://app.example/edit?startapp=x' },
          ],
        ],
      });
    });

    it('should remove publish button after main post is published', () => {
      expect(
        composer.buildAfterPublishModerationReplyMarkup({
          gigId: 'gig-a',
          publishPostUrl: 'https://t.me/x/1',
          editGigUrl: 'https://app.example/edit?startapp=x',
        }),
      ).toEqual({
        inline_keyboard: [
          [{ text: '✏️ Edit', url: 'https://app.example/edit?startapp=x' }],
        ],
      });
    });
  });

  describe('buildPublishedModerationCaption', () => {
    it('should include gig permalink after gig is published', () => {
      expect(
        composer.buildPublishedModerationCaption({
          title: 'Concert',
          gigUrl: 'https://app.example/gigs/concert',
        }),
      ).toBe(
        '🟢 Published\n\n<a href="https://app.example/gigs/concert">Concert</a>',
      );
    });

    it('should include Telegram post link when main post is published', () => {
      expect(
        composer.buildPublishedModerationCaption({
          title: 'Concert',
          gigUrl: 'https://app.example/gigs/concert',
          publishPostUrl: 'https://t.me/gigs/42',
          adminGigUrl: 'https://app.example/admin/gigs/concert',
        }),
      ).toBe(
        '🟢 Published | <a href="https://t.me/gigs/42">See post</a> | <a href="https://app.example/admin/gigs/concert">Open in admin</a>\n\n<a href="https://app.example/gigs/concert">Concert</a>',
      );
    });
  });

  describe('buildRejectedModerationReplyMarkup', () => {
    it('should build edit keyboard for moderation rejection', () => {
      expect(
        composer.buildRejectedModerationReplyMarkup(
          'https://app.example/edit?startapp=gig-a',
        ),
      ).toEqual({
        inline_keyboard: [
          [
            {
              text: '✏️ Edit',
              url: 'https://app.example/edit?startapp=gig-a',
            },
          ],
        ],
      });
    });
  });

  describe('buildRejectedModerationCaption', () => {
    it('should prepend rejected status to moderation body', () => {
      expect(
        composer.buildRejectedModerationCaption({
          body: 'Concert\n\n🗓 Fri, 1 Jan 2027',
        }),
      ).toBe('🔴 Rejected\n\nConcert\n\n🗓 Fri, 1 Jan 2027');
    });
  });

  describe('buildGigPermalink', () => {
    it('should build gigs URL from publicId', () => {
      const input: BuildGigPermalinkPayload = {
        baseUrl: 'https://app.example',
        publicId: 'gig-1',
      };

      expect(composer.buildGigPermalink(input)).toBe(
        'https://app.example/gigs/gig-1',
      );
    });

    it('should build admin gigs URL from publicId', () => {
      const input: BuildGigPermalinkPayload = {
        baseUrl: 'https://app.example',
        publicId: 'gig-1',
      };

      expect(composer.buildAdminGigUrl(input)).toBe(
        'https://app.example/admin/gigs/gig-1',
      );
    });
  });

  describe('buildCaption', () => {
    it('should include titled link when url is provided', () => {
      const caption = composer.buildCaption({
        url: 'https://app.example/gigs/ab',
        title: 'Concert',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: new Date('2026-06-01T12:00:00.000Z'),
      });

      expect(caption).toContain('<a href="https://app.example/gigs/ab">');
      expect(caption).toContain('Concert</a>');
      expect(caption).toContain('📍 Hall');
      expect(caption).toContain('🎫 https://tickets.example/x');
    });

    it('should include weekday in the date line', () => {
      const caption = composer.buildCaption({
        title: 'Concert',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: new Date('2026-06-01T12:00:00.000Z'),
      });

      expect(caption).toContain('Mon');
      expect(caption).toContain('1 Jun 2026');
    });
  });

  describe('composeMainPost', () => {
    beforeEach(() => {
      process.env.MAIN_CHANNEL_ID = '-1001';
    });

    afterEach(() => {
      delete process.env.MAIN_CHANNEL_ID;
    });

    it('should throw BadRequestException when MAIN_CHANNEL_ID is not configured', () => {
      delete process.env.MAIN_CHANNEL_ID;

      const gig = {
        _id: 'gig-env',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: -100,
            id: 1,
            fileId: 'fid',
            date: 86_400_000,
          },
        ],
      } as unknown as GigDocument;

      expect(() => composer.composeMainPost(gig)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when gig has no moderation file_id or poster URL', () => {
      const gig = {
        _id: 'gig1',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [],
      } as unknown as GigDocument;

      expect(() => composer.composeMainPost(gig)).toThrow(BadRequestException);
    });

    it('should use moderation Telegram file_id as photo when present', () => {
      const gig = {
        _id: 'gig2',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: -100,
            id: 5,
            fileId: 'file-id-abc',
            date: 86_400_000,
          },
        ],
      } as unknown as GigDocument;

      const payload = composer.composeMainPost(gig);

      expect(payload.photo).toBe('file-id-abc');
      expect(payload.chat_id).toBe('-1001');
    });
  });

  describe('composeModerationPost', () => {
    beforeEach(() => {
      process.env.MODERATION_CHANNEL_ID = '-2001';
      process.env.APP_BASE_URL = 'https://app.example';
    });

    afterEach(() => {
      delete process.env.MODERATION_CHANNEL_ID;
      delete process.env.APP_BASE_URL;
    });

    it('should throw BadRequestException when MODERATION_CHANNEL_ID is not configured', () => {
      delete process.env.MODERATION_CHANNEL_ID;

      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/p.jpg');

      const gig = {
        _id: 'gig-mod-env',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        poster: { bucketPath: 'gigs/x.jpg' },
      } as unknown as GigDocument;

      expect(() => composer.composeModerationPost(gig)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when gig has no poster URL', () => {
      const gig = {
        _id: 'gig-m1',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
      } as unknown as GigDocument;

      expect(() => composer.composeModerationPost(gig)).toThrow(
        BadRequestException,
      );
    });

    it('should return TGSendPhoto with poster URL from bucket when present', () => {
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/p.jpg');

      const gig = {
        _id: 'gig-m2',
        title: 'Show',
        publicId: 'gig-m2',
        country: 'ES',
        city: 'barcelona',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        poster: { bucketPath: 'gigs/x.jpg' },
      } as unknown as GigDocument;

      const payload = composer.composeModerationPost(gig);

      expect(payload.photo).toBe('https://cdn.example/p.jpg');
      expect(payload.chat_id).toBe('-2001');
      expect(payload.caption).toContain('🟡 Pending');
      expect(payload.caption).not.toContain('Gig</a>');
      expect(payload.parse_mode).toBe(TGParseMode.HTML);
    });
  });

  describe('composeModerationPost admin link', () => {
    it('should include admin link in pending moderation post caption', () => {
      process.env.MODERATION_CHANNEL_ID = '-2001';
      process.env.APP_BASE_URL = 'https://app.example';
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/p.jpg');

      const gig = {
        _id: 'gig-m3',
        title: 'Show',
        publicId: 'gig-m3',
        country: 'ES',
        city: 'barcelona',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        poster: { bucketPath: 'gigs/x.jpg' },
      } as unknown as GigDocument;

      const payload = composer.composeModerationPost(gig);

      expect(payload.caption).toContain(
        '<a href="https://app.example/admin/gigs/gig-m3">Open in admin</a>',
      );

      delete process.env.MODERATION_CHANNEL_ID;
      delete process.env.APP_BASE_URL;
    });
  });
  describe('composeSubmissionFeedbackPost', () => {
    beforeEach(() => {
      process.env.APP_BASE_URL = 'https://app.example';
    });

    afterEach(() => {
      delete process.env.APP_BASE_URL;
    });

    it('should throw BadRequestException when gig has no moderation file_id or poster URL', () => {
      const gig = {
        _id: 'gig-s1',
        title: 'Show',
        publicId: 'gig-s1',
        country: 'ES',
        city: 'barcelona',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [],
      } as unknown as GigDocument;

      expect(() => composer.composeSubmissionFeedbackPost(gig, 999)).toThrow(
        BadRequestException,
      );
    });

    it('should use moderation Telegram file_id as photo when present', () => {
      const gig = {
        _id: 'gig-s2',
        title: 'Show',
        publicId: 'gig-s2',
        country: 'ES',
        city: 'barcelona',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: -100,
            id: 3,
            fileId: 'file-feedback',
            date: 86_400_000,
          },
        ],
      } as unknown as GigDocument;

      const payload = composer.composeSubmissionFeedbackPost(gig, 424242);

      expect(payload.photo).toBe('file-feedback');
      expect(payload.chat_id).toBe(424242);
      expect(payload.reply_markup).toBeUndefined();
      expect(payload.caption).toContain('🟡 Pending');
      expect(payload.caption).not.toContain('Gig</a>');
      expect(payload.parse_mode).toBe(TGParseMode.HTML);
    });
  });

  describe('composeWeeklyDigest', () => {
    it('should return empty-week sendMessage when gigs list is empty', () => {
      const plan = composer.composeWeeklyDigest({
        chatId: '-1001',
        gigs: [],
      });

      expect(plan).toEqual({
        kind: WeeklyDigestMainChannelSendKind.SendMessage,
        payload: {
          chat_id: '-1001',
          text: mockPostTemplates.getText(
            TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty,
          ),
        },
      });
    });

    it('should return sendMediaGroup with caption on first item when at least two posters resolve', () => {
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/p.jpg');

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

      const plan = composer.composeWeeklyDigest({
        chatId: '-1002',
        gigs,
      });

      expect(plan.kind).toBe(WeeklyDigestMainChannelSendKind.SendMediaGroup);
      if (plan.kind !== WeeklyDigestMainChannelSendKind.SendMediaGroup) return;

      expect(plan.payload.chat_id).toBe('-1002');
      expect(plan.payload.media).toHaveLength(2);
      expect(plan.payload.media[0]).toMatchObject({
        type: TGInputMediaType.Photo,
        media: 'https://cdn.example/p.jpg',
        caption: expect.stringMatching(/Alpha/s),
      });
      expect(plan.payload.media[1]).toEqual({
        type: TGInputMediaType.Photo,
        media: 'https://cdn.example/p.jpg',
      });
    });

    it('should return sendPhoto with digest fallback id when exactly one poster resolves', () => {
      mockBucket.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/only.jpg',
      );

      const gigs = [
        {
          _id: 'a',
          title: 'Only',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
      ] as unknown as GigDocument[];

      const plan = composer.composeWeeklyDigest({
        chatId: '-1003',
        gigs,
      });

      expect(plan).toEqual({
        kind: WeeklyDigestMainChannelSendKind.SendPhoto,
        payload: {
          chat_id: '-1003',
          photo: 'https://cdn.example/only.jpg',
          caption: expect.stringMatching(/Only/s),
          parse_mode: TGParseMode.HTML,
        },
      });
    });

    it('should return caption as plain sendMessage when no posters resolve', () => {
      const gigs = [
        {
          _id: 'a',
          title: 'TextOnly',
          date: 86_400_000,
          posts: [],
        },
      ] as unknown as GigDocument[];

      const plan = composer.composeWeeklyDigest({
        chatId: '-1004',
        gigs,
      });

      expect(plan.kind).toBe(WeeklyDigestMainChannelSendKind.SendMessage);
      if (plan.kind !== WeeklyDigestMainChannelSendKind.SendMessage) return;

      expect(plan.payload.chat_id).toBe('-1004');
      expect(plan.payload.text).toContain('TextOnly');
    });
  });

  describe('composeWeeklyDigestCaption', () => {
    it('should append ellipsis when plain digest exceeds Telegram caption limit', () => {
      const longTitle = 'X'.repeat(1100);
      const gigs = [
        {
          _id: '1',
          title: longTitle,
          date: 86_400_000,
          venue: 'Hall',
          ticketsUrl: 'https://tickets.example/e',
          posts: [],
        },
      ] as unknown as GigDocument[];

      const text = composer.composeWeeklyDigestCaption(gigs);

      expect(text.endsWith('\n…')).toBe(true);
      expect(text.length).toBeLessThanOrEqual(TELEGRAM_MEDIA_CAPTION_MAX_CHARS);
    });
  });
});
