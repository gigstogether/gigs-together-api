import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GigPost, PlainGig } from '../gig/types/gig.types';
import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { BucketService } from '../bucket/bucket.service';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { TELEGRAM_MEDIA_CAPTION_MAX_CHARS } from './telegram-post-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import type { TelegramTemplateKey } from './telegram-template-keys';
import type { PlainTemplateParams } from './telegram-template.service';
import { TelegramTemplateService } from './telegram-template.service';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import {
  CallbackScope,
  encodeCallbackData,
  GigCandidateCallbackAction,
  GigCallbackAction,
} from './callback-action';
import type { BuildGigPermalinkPayload } from './types/telegram-post-composer.service.types';
import {
  PostEditKind,
  WeeklyDigestMainChannelSendKind,
} from './types/telegram-post-composer.service.types';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';

const TELEGRAM_POSTER_CACHE_BUST = 1_790_013_012_000;

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
    [TELEGRAM_TEMPLATE_KEYS.moderationGig]: '{statusLine}\n\n{body}',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackSubmitted]:
      'Suggestion {title} submitted',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedForModeration]:
      'Suggestion {title} accepted for moderation',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackRejected]:
      'Suggestion {title} rejected',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedWithPublicLink]:
      'Suggestion accepted: <a href="{gigUrl}">{title}</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkOpenAdmin]:
      '<a href="{url}">Open gig candidate in admin</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkSeeModerationPost]:
      '<a href="{url}">See moderation post</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigLinkOpenAdmin]:
      '<a href="{url}">Open gig in admin</a>',
    [TELEGRAM_TEMPLATE_KEYS.gigLinkSeeMainPost]:
      '<a href="{url}">See main post</a>',
    [TELEGRAM_TEMPLATE_KEYS.moderationLinkSeePost]:
      '<a href="{url}">See post</a>',
    [TELEGRAM_TEMPLATE_KEYS.moderationLinkOpenAdmin]:
      '<a href="{url}">Open in admin</a>',
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

describe('TelegramPostComposer', () => {
  let composer: TelegramPostComposerService;
  let mockPostTemplates: MockPostTemplates;

  const mockBucket = {
    getPublicFileUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(TELEGRAM_POSTER_CACHE_BUST);
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pickTgPost', () => {
    it('should return the Telegram post matching type when present', () => {
      const post = {
        to: Messenger.Telegram,
        type: PostType.Main,
        id: 7,
        chatId: -1001 as const,
        date: 1_700_000_000_000,
      };

      const result = composer.pickTgPost([post], PostType.Main);

      expect(result).toBe(post);
    });

    it('should return undefined when posts array is missing matching Telegram post', () => {
      expect(composer.pickTgPost(undefined, PostType.Main)).toBeUndefined();
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

  describe('buildGigModerationReplyMarkup', () => {
    it('should return Post callback and edit URL when the Main post does not exist', () => {
      expect(
        composer.buildGigModerationReplyMarkup({
          gigId: 'gig-a',
          expectedVersion: 7,
          isVisible: true,
          editGigUrl: 'https://app.example/edit?startapp=x',
        }),
      ).toEqual({
        inline_keyboard: [
          [
            {
              text: '📢 Post',
              callback_data: encodeCallbackData({
                scope: CallbackScope.Gig,
                action: GigCallbackAction.Post,
                id: 'gig-a',
                expectedVersion: 7,
              }),
            },
            { text: '✏️ Edit', url: 'https://app.example/edit?startapp=x' },
            {
              text: '🙈 Hide',
              callback_data: encodeCallbackData({
                scope: CallbackScope.Gig,
                action: GigCallbackAction.Hide,
                id: 'gig-a',
                expectedVersion: 7,
              }),
            },
          ],
        ],
      });
    });

    it('should remove Post button after the Main post is created', () => {
      expect(
        composer.buildGigModerationReplyMarkup({
          gigId: 'gig-a',
          expectedVersion: 7,
          isVisible: true,
          mainPostUrl: 'https://t.me/x/1',
          editGigUrl: 'https://app.example/edit?startapp=x',
        }),
      ).toEqual({
        inline_keyboard: [
          [
            { text: '✏️ Edit', url: 'https://app.example/edit?startapp=x' },
            {
              text: '🙈 Hide',
              callback_data: encodeCallbackData({
                scope: CallbackScope.Gig,
                action: GigCallbackAction.Hide,
                id: 'gig-a',
                expectedVersion: 7,
              }),
            },
          ],
        ],
      });
    });

    it('should replace Hide with Show when the Gig is hidden', () => {
      expect(
        composer.buildGigModerationReplyMarkup({
          gigId: 'gig-a',
          expectedVersion: 8,
          isVisible: false,
          mainPostUrl: 'https://t.me/x/1',
          editGigUrl: 'https://app.example/edit?startapp=x',
        }),
      ).toEqual({
        inline_keyboard: [
          [
            { text: '✏️ Edit', url: 'https://app.example/edit?startapp=x' },
            {
              text: '👁 Show',
              callback_data: encodeCallbackData({
                scope: CallbackScope.Gig,
                action: GigCallbackAction.Show,
                id: 'gig-a',
                expectedVersion: 8,
              }),
            },
          ],
        ],
      });
    });
  });

  describe('buildGigModerationCaption', () => {
    it('should include the Gig permalink', () => {
      expect(
        composer.buildGigModerationCaption({
          title: 'Concert',
          gigUrl: 'https://app.example/gigs/concert',
        }),
      ).toBe('<a href="https://app.example/gigs/concert">Concert</a>');
    });

    it('should include Telegram post link when the Main post exists', () => {
      expect(
        composer.buildGigModerationCaption({
          title: 'Concert',
          gigUrl: 'https://app.example/gigs/concert',
          mainPostUrl: 'https://t.me/gigs/42',
          adminGigUrl: 'https://app.example/admin/gigs/concert',
        }),
      ).toBe(
        '<a href="https://app.example/gigs/concert">Concert</a>\n\n<a href="https://app.example/admin/gigs/concert">Open gig in admin</a> | <a href="https://t.me/gigs/42">See main post</a>',
      );
    });
  });

  describe('buildGigPermalink', () => {
    afterEach(() => {
      delete process.env.EDIT_GIG_URL;
    });

    it('should build gigs URL from publicId', () => {
      const input: BuildGigPermalinkPayload = {
        baseUrl: 'https://app.example',
        publicId: 'gig-1',
      };

      expect(composer.buildGigPermalink(input)).toBe(
        'https://app.example/gigs/gig-1',
      );
    });

    it('should build admin Gig Mini App URL from publicId', () => {
      process.env.EDIT_GIG_URL = 'https://t.me/GigsTogetherStgBot/admin';

      expect(composer.buildAdminGigUrl('gig-1')).toBe(
        'https://t.me/GigsTogetherStgBot/admin?startapp=openGig-gig-1',
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
        id: 'gig-env',
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
      } as unknown as PlainGig;

      expect(() => composer.composeMainPost(gig)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when gig has no moderation file_id or poster URL', () => {
      const gig = {
        id: 'gig1',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [],
      } as unknown as PlainGig;

      expect(() => composer.composeMainPost(gig)).toThrow(BadRequestException);
    });

    it('should use moderation Telegram file_id as photo when present', () => {
      const gig = {
        id: 'gig2',
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
      } as unknown as PlainGig;

      const payload = composer.composeMainPost(gig);

      expect(payload.photo).toBe('file-id-abc');
      expect(payload.chat_id).toBe('-1001');
    });

    it('should use a fresh cache key for the R2 poster on every Telegram send', () => {
      vi.mocked(Date.now)
        .mockReturnValueOnce(TELEGRAM_POSTER_CACHE_BUST)
        .mockReturnValueOnce(TELEGRAM_POSTER_CACHE_BUST + 1);
      mockBucket.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      const gig = {
        id: 'gig3',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [],
        poster: { bucketPath: 'gigs/show' },
      } as unknown as PlainGig;

      const firstPayload = composer.composeMainPost(gig);
      const secondPayload = composer.composeMainPost(gig);

      expect(firstPayload.photo).toBe(
        `https://cdn.example/poster.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
      );
      expect(secondPayload.photo).toBe(
        `https://cdn.example/poster.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST + 1}`,
      );
    });

    it('should preserve an external poster URL because its query may be signed', () => {
      const externalUrl =
        'https://images.example/poster.jpg?signature=preserve-me';
      const gig = {
        id: 'gig4',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        posts: [],
        poster: { externalUrl },
      } as unknown as PlainGig;

      const payload = composer.composeMainPost(gig);

      expect(payload.photo).toBe(externalUrl);
    });

    it('should cache-bust the R2 poster when replacing Main post media', () => {
      mockBucket.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/poster.jpg',
      );
      const mainPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        chatId: -1001,
        id: 5,
        fileId: 'old-file-id',
        date: 86_400_000,
      };
      const gig = {
        id: 'gig5',
        publicId: 'show',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        version: 2,
        posts: [mainPost],
        poster: { bucketPath: 'gigs/show' },
      } as unknown as PlainGig;
      mockBucket.getPublicFileUrl.mockClear();

      const composition = composer.composeGigPostEdit({
        gig,
        post: mainPost,
        isMediaUpdateRequired: true,
      });

      expect(composition.kind).toBe(PostEditKind.Media);
      if (composition.kind !== PostEditKind.Media) return;
      const media = composition.payload.media;
      if (media === undefined) {
        throw new Error('Expected replacement media');
      }
      expect(media.media).toBe(
        `https://cdn.example/poster.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
      );
    });

    it('should use the provided Telegram poster reference when replacing Main post media', () => {
      const mainPost: GigPost = {
        to: Messenger.Telegram,
        type: PostType.Main,
        chatId: -1001,
        id: 5,
        fileId: 'old-file-id',
        date: 86_400_000,
      };
      const gig = {
        id: 'gig5',
        publicId: 'show',
        title: 'Show',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        version: 2,
        posts: [mainPost],
        poster: { bucketPath: 'gigs/show' },
      } as unknown as PlainGig;
      mockBucket.getPublicFileUrl.mockClear();

      const composition = composer.composeGigPostEdit({
        gig,
        post: mainPost,
        isMediaUpdateRequired: true,
        mediaReference: 'moderation-file-id',
      });

      expect(composition.kind).toBe(PostEditKind.Media);
      if (composition.kind !== PostEditKind.Media) return;
      const media = composition.payload.media;
      if (media === undefined) {
        throw new Error('Expected replacement media');
      }
      expect(media.media).toBe('moderation-file-id');
      expect(mockBucket.getPublicFileUrl).not.toHaveBeenCalled();
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
          parse_mode: TGParseMode.HTML,
          disable_web_page_preview: true,
        },
      });
    });

    it('should return sendMediaGroup with caption on first item when at least two posters resolve', () => {
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/p.jpg');

      const gigs = [
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
        media: `https://cdn.example/p.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
        caption: expect.stringMatching(/Alpha/s),
      });
      expect(plan.payload.media[1]).toEqual({
        type: TGInputMediaType.Photo,
        media: `https://cdn.example/p.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
      });
      expect(plan.mediaItems).toEqual([
        { position: 1, publicId: 'alpha-2026-01-01' },
        { position: 2, publicId: 'beta-2026-01-02' },
      ]);
    });

    it('should return sendPhoto with digest fallback id when exactly one poster resolves', () => {
      mockBucket.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/only.jpg',
      );

      const gigs = [
        {
          id: 'a',
          title: 'Only',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
      ] as unknown as PlainGig[];

      const plan = composer.composeWeeklyDigest({
        chatId: '-1003',
        gigs,
      });

      expect(plan).toEqual({
        kind: WeeklyDigestMainChannelSendKind.SendPhoto,
        payload: {
          chat_id: '-1003',
          photo: `https://cdn.example/only.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
          caption: expect.stringMatching(/Only/s),
          parse_mode: TGParseMode.HTML,
        },
      });
    });

    it('should return caption as plain sendMessage when no posters resolve', () => {
      const gigs = [
        {
          id: 'a',
          title: 'TextOnly',
          date: 86_400_000,
          posts: [],
        },
      ] as unknown as PlainGig[];

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
          id: '1',
          title: longTitle,
          date: 86_400_000,
          venue: 'Hall',
          ticketsUrl: 'https://tickets.example/e',
          posts: [],
        },
      ] as unknown as PlainGig[];

      const text = composer.composeWeeklyDigestCaption(gigs);

      expect(text.endsWith('\n…')).toBe(true);
      expect(text.length).toBeLessThanOrEqual(TELEGRAM_MEDIA_CAPTION_MAX_CHARS);
    });
  });

  describe('GigCandidate post composition', () => {
    beforeEach(() => {
      process.env.INTAKE_CHANNEL_ID = '-3001';
      process.env.MODERATION_CHANNEL_ID = '-3002';
      process.env.APP_BASE_URL = 'https://admin.example';
      process.env.EDIT_GIG_URL = 'https://t.me/GigsTogetherStgBot/admin';
    });

    afterEach(() => {
      delete process.env.INTAKE_CHANNEL_ID;
      delete process.env.MODERATION_CHANNEL_ID;
      delete process.env.APP_BASE_URL;
      delete process.env.EDIT_GIG_URL;
    });

    it('should compose Intake with Send to moderation and Reject actions', () => {
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/ug.jpg');

      const payload = composer.composeGigCandidateIntakePost({
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'form' },
        },
        gigDraft: {
          title: 'Suggested Band',
          date: new Date('2026-08-01T00:00:00.000Z').getTime(),
          city: 'Barcelona',
          country: 'ES',
          poster: { bucketPath: 'gigs/2026/es/barcelona/gc-1' },
        },
        version: 0,
        status: GigCandidateStatus.New,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(payload.chat_id).toBe('-3001');
      expect(payload.photo).toBe(
        `https://cdn.example/ug.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
      );
      expect(payload.caption).toContain('Suggested Band');
      expect(payload.caption).not.toContain('⚪');
      expect(payload.caption).not.toContain('New');
      expect(payload.caption).not.toContain('ES / Barcelona');
      expect(payload.caption).toContain('\n\n──────────\nSource: user');
      expect(payload.caption).toContain(
        '<a href="https://t.me/GigsTogetherStgBot/admin?startapp=openGigCandidate-507f1f77bcf86cd799439099">Open gig candidate in admin</a>',
      );
      expect(payload.reply_markup).toEqual({
        inline_keyboard: [
          [
            {
              text: '➡️ Send to moderation',
              callback_data: encodeCallbackData({
                scope: CallbackScope.GigCandidate,
                action: GigCandidateCallbackAction.SendToModeration,
                id: '507f1f77bcf86cd799439099',
                expectedVersion: 1,
              }),
            },
            {
              text: '❌ Reject',
              callback_data: encodeCallbackData({
                scope: CallbackScope.GigCandidate,
                action: GigCandidateCallbackAction.Reject,
                id: '507f1f77bcf86cd799439099',
                expectedVersion: 1,
              }),
            },
          ],
        ],
      });
    });

    it('should compose Moderation with Approve, Edit and Reject controls', () => {
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/ug.jpg');

      const payload = composer.composeGigCandidateModerationPost({
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'admin' },
        },
        gigDraft: {
          title: 'Suggested Band',
          date: 1,
          city: 'Barcelona',
          country: 'ES',
          poster: { bucketPath: 'gigs/x' },
        },
        version: 2,
        status: GigCandidateStatus.Reviewing,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(payload.chat_id).toBe('-3002');
      expect(payload.photo).toBe(
        `https://cdn.example/ug.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
      );
      expect(payload.caption).toContain('🟡 Suggested Band');
      expect(payload.caption).not.toContain('Reviewing');
      expect(payload.caption).not.toContain('ES / Barcelona');
      expect(payload.caption).toContain('\n\n──────────\nSource: user');
      expect(payload.caption).not.toContain('66a000000000000000000000042');
      expect(payload.caption).toContain(
        '<a href="https://t.me/GigsTogetherStgBot/admin?startapp=openGigCandidate-507f1f77bcf86cd799439099">Open gig candidate in admin</a>',
      );
      expect(payload.reply_markup?.inline_keyboard[0]).toEqual([
        {
          text: '✅ Approve',
          callback_data: encodeCallbackData({
            scope: CallbackScope.GigCandidate,
            action: GigCandidateCallbackAction.Approve,
            id: '507f1f77bcf86cd799439099',
            expectedVersion: 3,
          }),
        },
        {
          text: '✏️ Edit',
          url: 'https://t.me/GigsTogetherStgBot/admin?startapp=editGigCandidate-507f1f77bcf86cd799439099',
        },
        {
          text: '❌ Reject',
          callback_data: encodeCallbackData({
            scope: CallbackScope.GigCandidate,
            action: GigCandidateCallbackAction.Reject,
            id: '507f1f77bcf86cd799439099',
            expectedVersion: 3,
          }),
        },
      ]);
    });

    it('should update the Moderation title with actions for the current version', () => {
      const gigCandidate: GigCandidate = {
        id: '507f1f77bcf86cd799439099',
        source: {
          type: 'user',
          userId: '66a000000000000000000000042',
          origin: { type: 'admin' },
        },
        gigDraft: {
          title: 'Updated Band',
          date: 1,
          city: 'Barcelona',
          country: 'ES',
        },
        version: 4,
        status: GigCandidateStatus.Reviewing,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1,
        id: 50,
        chatId: -200,
      };

      const composition = composer.composeGigCandidatePostEdit({
        gigCandidate,
        post: moderationPost,
        isMediaUpdateRequired: false,
      });

      expect(composition.kind).toBe(PostEditKind.Caption);
      if (composition.kind !== PostEditKind.Caption) return;
      expect(composition.payload.caption).toContain('🟡 Updated Band');
      expect(composition.payload.replyMarkup?.inline_keyboard[0]?.[0]).toEqual(
        expect.objectContaining({
          callback_data: encodeCallbackData({
            scope: CallbackScope.GigCandidate,
            action: GigCandidateCallbackAction.Approve,
            id: gigCandidate.id,
            expectedVersion: 4,
          }),
        }),
      );
    });

    it('should compose fresh media when replacing a GigCandidate poster', () => {
      mockBucket.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/gig-candidate.jpg',
      );
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
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const moderationPost: GigCandidate['posts'][number] = {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: 1,
        id: 50,
        chatId: -200,
        fileId: 'old-file-id',
      };

      const composition = composer.composeGigCandidatePostEdit({
        gigCandidate,
        post: moderationPost,
        isMediaUpdateRequired: true,
      });

      expect(composition).toEqual({
        kind: PostEditKind.Media,
        payload: {
          chatId: -200,
          messageId: 50,
          media: {
            type: TGInputMediaType.Photo,
            media: `https://cdn.example/gig-candidate.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
            caption: expect.stringContaining('🟡 Updated Band'),
            parse_mode: TGParseMode.HTML,
          },
          replyMarkup: expect.objectContaining({
            inline_keyboard: expect.any(Array),
          }),
        },
      });
    });

    it('should throw BadRequestException when INTAKE_CHANNEL_ID is missing', () => {
      delete process.env.INTAKE_CHANNEL_ID;
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/ug.jpg');

      expect(() =>
        composer.composeGigCandidateIntakePost({
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
            poster: { bucketPath: 'gigs/x' },
          },
          version: 0,
          status: GigCandidateStatus.New,
          posts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(BadRequestException);
    });

    it('should compose submitted feedback with the Gig title', () => {
      expect(
        composer.composeGigCandidateFeedbackMessage({
          chatId: '42',
          kind: 'submitted',
          title: 'Band & Friends',
        }),
      ).toEqual({
        chat_id: '42',
        text: 'Suggestion Band &amp; Friends submitted',
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: false,
      });
    });

    it('should compose rejected feedback with the Gig title', () => {
      expect(
        composer.composeGigCandidateFeedbackMessage({
          chatId: '42',
          kind: 'rejected',
          title: 'Band & Friends',
        }),
      ).toEqual({
        chat_id: '42',
        text: 'Suggestion Band &amp; Friends rejected',
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: false,
      });
    });

    it('should compose accepted-for-moderation feedback with the Gig title', () => {
      expect(
        composer.composeGigCandidateFeedbackMessage({
          chatId: '42',
          kind: 'acceptedForModeration',
          title: 'Band & Friends',
        }),
      ).toEqual({
        chat_id: '42',
        text: 'Suggestion Band &amp; Friends accepted for moderation',
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: false,
      });
    });

    it('should compose accepted feedback with a titled link and disabled preview', () => {
      expect(
        composer.composeGigCandidateFeedbackMessage({
          chatId: '42',
          kind: 'acceptedWithPublicLink',
          publicId: 'radiohead-2026-06-12',
          title: 'Radiohead & Friends',
        }),
      ).toEqual({
        chat_id: '42',
        text: 'Suggestion accepted: <a href="https://admin.example/gigs/radiohead-2026-06-12">Radiohead &amp; Friends</a>',
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: true,
      });
    });

    it('should compose a rejected channel-post update without actions', () => {
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
        posts: [],
        rejectedAt: new Date(),
        rejectedByUserId: '66a000000000000000000000043',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const payload = composer.composeRejectedGigCandidatePostEdit({
        gigCandidate,
        post: {
          to: Messenger.Telegram,
          type: PostType.Intake,
          date: 1,
          id: 10,
          chatId: -100,
        },
      });

      expect(payload).toMatchObject({
        chatId: -100,
        messageId: 10,
        caption: expect.stringContaining('🔴 Suggested Band'),
        replyMarkup: { inline_keyboard: [] },
      });
      expect(payload.caption).not.toContain('Rejected');
      expect(payload.caption).toContain(
        '<a href="https://t.me/GigsTogetherStgBot/admin?startapp=openGigCandidate-507f1f77bcf86cd799439099">Open gig candidate in admin</a>',
      );
    });

    it('should replace Intake actions with admin and Moderation links after handoff', () => {
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
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const payload = composer.composeGigCandidateIntakePostAfterModerationEdit(
        {
          gigCandidate,
          intakePost: {
            to: Messenger.Telegram,
            type: PostType.Intake,
            date: 1,
            id: 10,
            chatId: -1003001,
          },
          moderationPost: {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            date: 2,
            id: 20,
            chatId: -1003002,
          },
        },
      );

      expect(payload).toMatchObject({
        chatId: -1003001,
        messageId: 10,
        replyMarkup: { inline_keyboard: [] },
      });
      expect(payload.caption).toContain('Suggested Band');
      expect(payload.caption).not.toContain('🟡');
      expect(payload.caption).not.toContain('Reviewing');
      expect(payload.caption).toContain(
        '<a href="https://t.me/GigsTogetherStgBot/admin?startapp=openGigCandidate-507f1f77bcf86cd799439099">Open gig candidate in admin</a> | <a href="https://t.me/c/3002/20">See moderation post</a>',
      );
    });
  });
});
