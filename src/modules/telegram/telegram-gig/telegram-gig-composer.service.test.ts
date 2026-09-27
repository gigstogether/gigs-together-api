import { Test } from '@nestjs/testing';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import type { PlainGig } from '../../gig/types/gig.types';
import {
  CallbackScope,
  GigCallbackAction,
} from '../utils/telegram-callback-action';
import { TelegramComposerService } from '../telegram-composer.service';
import { PostEditKind } from '../telegram-composer.service.types';
import type { TelegramTemplateKey } from '../telegram-template-keys';
import type { PlainTemplateParams } from '../telegram-template.service';
import { TelegramTemplateService } from '../telegram-template.service';
import { TelegramGigComposerService } from './telegram-gig-composer.service';
import { TelegramService } from '../telegram.service';

function createGig(): PlainGig {
  return {
    id: '507f1f77bcf86cd799439011',
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    poster: { externalUrl: 'https://cdn.example/poster.jpg' },
    isVisible: false,
    version: 4,
    source: {
      type: 'user',
      userId: '507f1f77bcf86cd799439012',
      origin: { type: 'admin' },
    },
    posts: [],
    createdAt: new Date('2026-05-30T14:22:00.000Z'),
    updatedAt: new Date('2026-05-30T14:22:00.000Z'),
  };
}

describe('TelegramGigComposerService', () => {
  let service: TelegramGigComposerService;

  const telegramTemplates = {
    getText: vi.fn((key: TelegramTemplateKey) => key),
    render: vi.fn(
      (key: TelegramTemplateKey, params: PlainTemplateParams) =>
        `${key}:${Object.values(params).map(String).join('|')}`,
    ),
  };

  const telegramService = {
    resolvePosterUrl: vi.fn(
      (poster: PlainGig['poster']) => poster?.externalUrl,
    ),
  };

  beforeEach(async () => {
    vi.stubEnv('MAIN_CHANNEL_ID', '-100200');
    vi.stubEnv('APP_BASE_URL', 'https://app.example');
    vi.stubEnv('EDIT_GIG_URL', 'https://app.example/admin');

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramGigComposerService,
        TelegramComposerService,
        {
          provide: TelegramTemplateService,
          useValue: telegramTemplates,
        },
        { provide: TelegramService, useValue: telegramService },
      ],
    }).compile();

    service = moduleRef.get(TelegramGigComposerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should compose a main post with the moderation photo', () => {
    const gig = createGig();
    gig.posts = [
      {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        id: 42,
        chatId: -100100,
        date: Date.UTC(2026, 5, 1),
        fileId: 'moderation-file-id',
      },
    ];

    const result = service.composeMainPost(gig);

    expect(result).toEqual(
      expect.objectContaining({
        chat_id: '-100200',
        photo: 'moderation-file-id',
      }),
    );
  });

  it('should compose a media edit for a main post', () => {
    const gig = createGig();
    const mainPost = {
      to: Messenger.Telegram,
      type: PostType.Main,
      id: 50,
      chatId: -100200,
      date: Date.UTC(2026, 5, 2),
      fileId: 'old-file-id',
    };
    gig.posts = [mainPost];

    const result = service.composePostEdit({
      gig,
      post: mainPost,
      isMediaUpdateRequired: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: PostEditKind.Media,
        payload: expect.objectContaining({
          chatId: -100200,
          messageId: 50,
        }),
      }),
    );
  });

  it('should compose moderation actions from Gig state', () => {
    const result = service.buildModerationReplyMarkup({
      gigId: '507f1f77bcf86cd799439011',
      expectedVersion: 4,
      isVisible: false,
      editGigUrl: 'https://app.example/admin?startapp=editGig-test',
    });

    expect(result?.inline_keyboard[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          callback_data: expect.stringContaining(
            `${CallbackScope.Gig}:${GigCallbackAction.Post}`,
          ),
        }),
        expect.objectContaining({
          callback_data: expect.stringContaining(
            `${CallbackScope.Gig}:${GigCallbackAction.Show}`,
          ),
        }),
      ]),
    );
  });
});
