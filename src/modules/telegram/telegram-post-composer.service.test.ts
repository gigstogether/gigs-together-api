import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GigPost, PlainGig } from '../gig/types/gig.types';
import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../../shared/types/post-type.enum';
import { BucketService } from '../bucket/bucket.service';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { TelegramGigCandidateComposerService } from './composers/telegram-gig-candidate-composer.service';
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
import type { BuildGigPermalinkPayload } from './telegram-post-composer.service.types';
import { PostEditKind } from './telegram-post-composer.service.types';
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
      'Suggestion accepted: <a href="{gigUrl}">{title}</a>',
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

describe('TelegramPostComposerService', () => {
  let composer: TelegramPostComposerService;
  let gigCandidateComposer: TelegramGigCandidateComposerService;
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
        TelegramGigCandidateComposerService,
        {
          provide: TelegramTemplateService,
          useValue: mockPostTemplates,
        },
        { provide: BucketService, useValue: mockBucket },
      ],
    }).compile();

    composer = moduleRef.get(TelegramPostComposerService);
    gigCandidateComposer = moduleRef.get(TelegramGigCandidateComposerService);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  describe('TelegramGigCandidateComposerService', () => {
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

      const payload = gigCandidateComposer.composeIntakePost({
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

      if (!('photo' in payload)) {
        throw new Error('Expected a photo Intake payload');
      }
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

    it('should compose a text Intake post when GigCandidate has no poster', () => {
      const payload = gigCandidateComposer.composeIntakePost({
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
        version: 0,
        status: GigCandidateStatus.New,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(payload).toMatchObject({
        chat_id: '-3001',
        text: expect.stringContaining('Suggested Band'),
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: true,
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      });
      expect('photo' in payload).toBe(false);
    });

    it('should compose Moderation with Approve, Edit and Reject controls', () => {
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/ug.jpg');

      const payload = gigCandidateComposer.composeModerationPost({
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
        fileId: 'moderation-file-id',
        date: 1,
        id: 50,
        chatId: -200,
      };

      const composition = gigCandidateComposer.composePostEdit({
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

      const composition = gigCandidateComposer.composePostEdit({
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
        gigCandidateComposer.composeIntakePost({
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
        gigCandidateComposer.composeFeedbackMessage({
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
        gigCandidateComposer.composeFeedbackMessage({
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
        gigCandidateComposer.composeFeedbackMessage({
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
        gigCandidateComposer.composeFeedbackMessage({
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

      const composition = gigCandidateComposer.composeRejectedPostEdit({
        gigCandidate,
        post: {
          to: Messenger.Telegram,
          type: PostType.Intake,
          fileId: 'intake-file-id',
          date: 1,
          id: 10,
          chatId: -100,
        },
      });

      expect(composition).toMatchObject({
        kind: PostEditKind.Caption,
        payload: {
          chatId: -100,
          messageId: 10,
          caption: expect.stringContaining('🔴 Suggested Band'),
          replyMarkup: { inline_keyboard: [] },
        },
      });
      if (composition.kind !== PostEditKind.Caption) {
        throw new Error('Expected a caption edit');
      }
      expect(composition.payload.caption).not.toContain('Rejected');
      expect(composition.payload.caption).toContain(
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

      const composition =
        gigCandidateComposer.composeIntakePostAfterModerationEdit({
          gigCandidate,
          intakePost: {
            to: Messenger.Telegram,
            type: PostType.Intake,
            fileId: 'intake-file-id',
            date: 1,
            id: 10,
            chatId: -1003001,
          },
          moderationPost: {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            fileId: 'moderation-file-id',
            date: 2,
            id: 20,
            chatId: -1003002,
          },
        });

      expect(composition).toMatchObject({
        kind: PostEditKind.Caption,
        payload: {
          chatId: -1003001,
          messageId: 10,
          replyMarkup: { inline_keyboard: [] },
        },
      });
      if (composition.kind !== PostEditKind.Caption) {
        throw new Error('Expected a caption edit');
      }
      expect(composition.payload.caption).toContain('Suggested Band');
      expect(composition.payload.caption).not.toContain('🟡');
      expect(composition.payload.caption).not.toContain('Reviewing');
      expect(composition.payload.caption).toContain(
        '<a href="https://t.me/GigsTogetherStgBot/admin?startapp=openGigCandidate-507f1f77bcf86cd799439099">Open gig candidate in admin</a> | <a href="https://t.me/c/3002/20">See moderation post</a>',
      );
    });

    it('should edit a text Intake post as text after moderation handoff', () => {
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
          poster: { bucketPath: 'gigs/default.jpg' },
        },
        version: 3,
        status: GigCandidateStatus.Reviewing,
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const composition =
        gigCandidateComposer.composeIntakePostAfterModerationEdit({
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
            fileId: 'moderation-file-id',
            date: 2,
            id: 20,
            chatId: -1003002,
          },
        });

      expect(composition).toMatchObject({
        kind: PostEditKind.Text,
        payload: {
          chatId: -1003001,
          messageId: 10,
          text: expect.stringContaining('Suggested Band'),
          disableWebPagePreview: true,
          replyMarkup: { inline_keyboard: [] },
        },
      });
    });
  });
});
