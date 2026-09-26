import { Test } from '@nestjs/testing';
import type { PlainGig } from '../../gig/types/gig.types';
import { BucketService } from '../../bucket/bucket.service';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import { TelegramPostComposerService } from '../telegram-post-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import type { TelegramTemplateKey } from '../telegram-template-keys';
import type { PlainTemplateParams } from '../telegram-template.service';
import { TelegramTemplateService } from '../telegram-template.service';
import { TGInputMediaType, TGParseMode } from '../types/message.types';
import {
  TELEGRAM_DIGEST_CAPTION_MAX_CHARS,
  TelegramDigestComposerService,
} from './telegram-digest-composer.service';
import { WeeklyDigestSendKind } from './telegram-digest-composer.types';

const TELEGRAM_POSTER_CACHE_BUST = 1_790_013_012_000;

type MockTelegramTemplates = Pick<
  TelegramTemplateService,
  'getText' | 'render'
>;

function renderPlainTemplate(
  template: string,
  params: PlainTemplateParams,
): string {
  return template.replace(/\{(\w+)\}/g, (match, rawKey: string) => {
    const value = params[rawKey];
    return value === null || value === undefined ? match : String(value);
  });
}

function createMockTelegramTemplates(): MockTelegramTemplates {
  const texts: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty]:
      'There are no gigs scheduled for this week.',
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestHeader]:
      "Here's what is happening this week:",
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestFooter]: 'See you at the gigs!',
    [TELEGRAM_TEMPLATE_KEYS.weeklyDigestTicketsLabel]: 'Tickets',
  };
  const templates: Partial<Record<TelegramTemplateKey, string>> = {
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
      return template === undefined
        ? ''
        : renderPlainTemplate(template, params);
    }),
  };
}

describe('TelegramDigestComposerService', () => {
  let composer: TelegramDigestComposerService;
  let telegramTemplates: MockTelegramTemplates;

  const bucketService = {
    getPublicFileUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(TELEGRAM_POSTER_CACHE_BUST);
    telegramTemplates = createMockTelegramTemplates();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramDigestComposerService,
        TelegramPostComposerService,
        {
          provide: TelegramTemplateService,
          useValue: telegramTemplates,
        },
        { provide: BucketService, useValue: bucketService },
      ],
    }).compile();

    composer = moduleRef.get(TelegramDigestComposerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete process.env.APP_BASE_URL;
  });

  it('should compose an empty-week message when no gigs exist', () => {
    const plan = composer.composeWeeklyDigest({ chatId: '-1001', gigs: [] });

    expect(plan).toEqual({
      kind: WeeklyDigestSendKind.SendMessage,
      payload: {
        chat_id: '-1001',
        text: 'There are no gigs scheduled for this week.',
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: true,
      },
    });
  });

  it('should compose a media group when at least two posters resolve', () => {
    bucketService.getPublicFileUrl.mockReturnValue(
      'https://cdn.example/poster.jpg',
    );
    const gigs = createDigestGigs();

    const plan = composer.composeWeeklyDigest({ chatId: '-1002', gigs });

    expect(plan).toEqual({
      kind: WeeklyDigestSendKind.SendMediaGroup,
      payload: {
        chat_id: '-1002',
        media: [
          {
            type: TGInputMediaType.Photo,
            media: `https://cdn.example/poster.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
            caption: expect.stringMatching(/Alpha/s),
            parse_mode: TGParseMode.HTML,
          },
          {
            type: TGInputMediaType.Photo,
            media: `https://cdn.example/poster.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
          },
        ],
      },
      mediaItems: [
        { position: 1, publicId: 'alpha-2026-01-01' },
        { position: 2, publicId: 'beta-2026-01-02' },
      ],
    });
  });

  it('should compose a photo when exactly one poster resolves', () => {
    bucketService.getPublicFileUrl.mockReturnValue(
      'https://cdn.example/only.jpg',
    );
    const gigs = [createDigestGigs()[0]];

    const plan = composer.composeWeeklyDigest({ chatId: '-1003', gigs });

    expect(plan).toEqual({
      kind: WeeklyDigestSendKind.SendPhoto,
      payload: {
        chat_id: '-1003',
        photo: `https://cdn.example/only.jpg?tgcb=${TELEGRAM_POSTER_CACHE_BUST}`,
        caption: expect.stringMatching(/Alpha/s),
        parse_mode: TGParseMode.HTML,
      },
    });
  });

  it('should reuse a moderation file id before resolving a poster URL', () => {
    const gig = createDigestGigs()[0];
    gig.posts = [
      {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        id: 42,
        chatId: -1001,
        date: 1,
        fileId: 'telegram-file-id',
      },
    ];

    const plan = composer.composeWeeklyDigest({
      chatId: '-1004',
      gigs: [gig],
    });

    expect(plan).toEqual({
      kind: WeeklyDigestSendKind.SendPhoto,
      payload: expect.objectContaining({ photo: 'telegram-file-id' }),
    });
    expect(bucketService.getPublicFileUrl).not.toHaveBeenCalled();
  });

  it('should compose text when no posters resolve', () => {
    const gig = createDigestGigs()[0];
    delete gig.poster;

    const plan = composer.composeWeeklyDigest({
      chatId: '-1005',
      gigs: [gig],
    });

    expect(plan).toEqual({
      kind: WeeklyDigestSendKind.SendMessage,
      payload: expect.objectContaining({
        chat_id: '-1005',
        text: expect.stringContaining('Alpha'),
      }),
    });
  });

  it('should truncate a caption that exceeds the Telegram limit', () => {
    bucketService.getPublicFileUrl.mockReturnValue(
      'https://cdn.example/poster.jpg',
    );
    const gig = createDigestGigs()[0];
    gig.title = 'X'.repeat(1_100);

    const plan = composer.composeWeeklyDigest({
      chatId: '-1006',
      gigs: [gig],
    });

    expect(plan.kind).toBe(WeeklyDigestSendKind.SendPhoto);
    if (plan.kind !== WeeklyDigestSendKind.SendPhoto) {
      throw new Error('Expected a photo digest plan');
    }
    expect(plan.payload.caption?.endsWith('\n…')).toBe(true);
    expect(plan.payload.caption?.length).toBeLessThanOrEqual(
      TELEGRAM_DIGEST_CAPTION_MAX_CHARS,
    );
  });
});

function createDigestGigs(): PlainGig[] {
  return [
    {
      id: 'a',
      publicId: 'alpha-2026-01-01',
      title: 'Alpha',
      date: 10,
      venue: 'Alpha Hall',
      ticketsUrl: 'https://tickets.example/alpha',
      posts: [],
      poster: { bucketPath: 'gigs/a.jpg' },
    },
    {
      id: 'b',
      publicId: 'beta-2026-01-02',
      title: 'Beta',
      date: 20,
      venue: 'Beta Hall',
      ticketsUrl: 'https://tickets.example/beta',
      posts: [],
      poster: { bucketPath: 'gigs/b.jpg' },
    },
  ] as unknown as PlainGig[];
}
