import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GigDocument } from '../gig/gig.schema';
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
import { WeeklyDigestMainChannelSendKind } from './types/telegram-post-composer.service.types';
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
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedForModeration]:
      'Suggestion {title} accepted for moderation',
    [TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedWithPublicLink]:
      'Suggestion accepted: <a href="{gigUrl}">{title}</a>',
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

  describe('buildAfterPublishModerationReplyMarkup', () => {
    it('should return publish callback and edit URL when main post is not published yet', () => {
      expect(
        composer.buildAfterPublishModerationReplyMarkup({
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

    it('should remove publish button after main post is published', () => {
      expect(
        composer.buildAfterPublishModerationReplyMarkup({
          gigId: 'gig-a',
          expectedVersion: 7,
          isVisible: true,
          publishPostUrl: 'https://t.me/x/1',
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
        composer.buildAfterPublishModerationReplyMarkup({
          gigId: 'gig-a',
          expectedVersion: 8,
          isVisible: false,
          publishPostUrl: 'https://t.me/x/1',
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

  describe('buildPublishedModerationCaption', () => {
    it('should include gig permalink after gig is published', () => {
      expect(
        composer.buildPublishedModerationCaption({
          title: 'Concert',
          gigUrl: 'https://app.example/gigs/concert',
        }),
      ).toBe('<a href="https://app.example/gigs/concert">Concert</a>');
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
        '<a href="https://app.example/gigs/concert">Concert</a> | <a href="https://app.example/admin/gigs/concert">Open in admin</a> | <a href="https://t.me/gigs/42">See post</a>',
      );
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

  describe('GigCandidate post composition', () => {
    beforeEach(() => {
      process.env.INTAKE_CHANNEL_ID = '-3001';
      process.env.MODERATION_CHANNEL_ID = '-3002';
      process.env.APP_BASE_URL = 'https://admin.example';
    });

    afterEach(() => {
      delete process.env.INTAKE_CHANNEL_ID;
      delete process.env.MODERATION_CHANNEL_ID;
      delete process.env.APP_BASE_URL;
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
      expect(payload.caption).toContain('⚪ Suggested Band');
      expect(payload.caption).not.toContain('New');
      expect(payload.caption).toContain('\n\n──────────\nSource: user');
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

    it('should compose Moderation with inactive Approve, Edit and Reject controls', () => {
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
      expect(payload.caption).toContain('🟡 Suggested Band');
      expect(payload.caption).not.toContain('Reviewing');
      expect(payload.caption).toContain('\n\n──────────\nSource: user');
      expect(payload.caption).not.toContain('66a000000000000000000000042');
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
          url: 'https://admin.example/admin/gigs/candidates/507f1f77bcf86cd799439099/edit',
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

    it('should compose rejected feedback', () => {
      expect(
        composer.composeGigCandidateFeedbackMessage({
          chatId: '42',
          kind: 'rejected',
        }),
      ).toEqual({
        chat_id: '42',
        text: 'Suggestion rejected',
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

      expect(
        composer.composeRejectedGigCandidatePostEdit({
          gigCandidate,
          post: {
            to: Messenger.Telegram,
            type: PostType.Intake,
            date: 1,
            id: 10,
            chatId: -100,
          },
        }),
      ).toMatchObject({
        chatId: -100,
        messageId: 10,
        caption: expect.stringContaining('🔴 Suggested Band'),
        replyMarkup: { inline_keyboard: [] },
      });
    });
  });
});
