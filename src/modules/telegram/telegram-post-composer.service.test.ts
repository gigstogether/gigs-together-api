import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GigDocument } from '../gig/gig.schema';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { BucketService } from '../bucket/bucket.service';
import {
  TelegramPostComposer,
  WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
  WeeklyDigestMainChannelSendKind,
} from './telegram-post-composer.service';
import { TELEGRAM_MEDIA_CAPTION_MAX_CHARS } from './telegram-post-composer.service';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import type { BuildGigPermalinkPayload } from './telegram-post-composer.service';
import { Action } from './types/action.enum';

describe('TelegramPostComposer', () => {
  let composer: TelegramPostComposer;

  const mockBucket = {
    getPublicFileUrl: vi.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramPostComposer,
        { provide: BucketService, useValue: mockBucket },
      ],
    }).compile();

    composer = moduleRef.get(TelegramPostComposer);
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
              text: 'Post',
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
    it('should include feed link after gig is published', () => {
      expect(
        composer.buildPublishedModerationCaption({
          title: 'Concert',
          gigUrl: 'https://app.example/feed/es/bcn#concert',
        }),
      ).toBe(
        'Concert\n\n<a href="https://app.example/feed/es/bcn#concert">Gig in feed</a>',
      );
    });

    it('should include Telegram post link when main post is published', () => {
      expect(
        composer.buildPublishedModerationCaption({
          title: 'Concert',
          gigUrl: 'https://app.example/feed/es/bcn#concert',
          publishPostUrl: 'https://t.me/gigs/42',
        }),
      ).toBe(
        'Concert\n\n<a href="https://app.example/feed/es/bcn#concert">Gig in feed</a>\n<a href="https://t.me/gigs/42">Telegram post</a>',
      );
    });
  });

  describe('buildRejectedModerationReplyMarkup', () => {
    it('should build rejected callback keyboard for gig id', () => {
      expect(composer.buildRejectedModerationReplyMarkup('gig-a')).toEqual({
        inline_keyboard: [
          [
            {
              text: '❌ Rejected',
              callback_data: `${Action.Rejected}:gig-a`,
            },
          ],
        ],
      });
    });
  });

  describe('buildGigPermalink', () => {
    it('should build feed URL with lowercased country and city and hash publicId', () => {
      const input: BuildGigPermalinkPayload = {
        baseUrl: 'https://app.example',
        country: 'ES',
        city: 'BCN',
        publicId: 'gig-1',
      };

      expect(composer.buildGigPermalink(input)).toBe(
        'https://app.example/feed/es/bcn#gig-1',
      );
    });
  });

  describe('buildCaption', () => {
    it('should include titled link when url is provided', () => {
      const caption = composer.buildCaption({
        url: 'https://app.example/feed/es/bcn#ab',
        title: 'Concert',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: new Date('2026-06-01T12:00:00.000Z'),
      });

      expect(caption).toContain(
        '<a href="https://app.example/feed/es/bcn#ab">',
      );
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
    });

    afterEach(() => {
      delete process.env.MODERATION_CHANNEL_ID;
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
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: 86_400_000,
        poster: { bucketPath: 'gigs/x.jpg' },
      } as unknown as GigDocument;

      const payload = composer.composeModerationPost(gig);

      expect(payload.photo).toBe('https://cdn.example/p.jpg');
      expect(payload.chat_id).toBe('-2001');
    });
  });

  describe('composeSubmissionFeedbackPost', () => {
    it('should throw BadRequestException when gig has no moderation file_id or poster URL', () => {
      const gig = {
        _id: 'gig-s1',
        title: 'Show',
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
          text: WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
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
