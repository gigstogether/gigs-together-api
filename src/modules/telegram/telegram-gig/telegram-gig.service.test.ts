import { Test } from '@nestjs/testing';
import { BucketService } from '../../bucket/bucket.service';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import type { PlainGig } from '../../gig/types/gig.types';
import { TelegramGigComposerService } from './telegram-gig-composer.service';
import { TelegramBotClient } from '../telegram-bot.client';
import { TelegramComposerService } from '../telegram-composer.service';
import { PostEditKind } from '../telegram-composer.service.types';
import type { TelegramTemplateKey } from '../telegram-template-keys';
import type { PlainTemplateParams } from '../telegram-template.service';
import { TelegramTemplateService } from '../telegram-template.service';
import { TelegramGigService } from './telegram-gig.service';

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

describe('TelegramGigService', () => {
  let service: TelegramGigService;

  const telegramBotClient = {
    sendPhoto: vi.fn(),
    editMessageMedia: vi.fn(),
    editMessageCaption: vi.fn(),
    editMessageText: vi.fn(),
  };

  const telegramTemplates = {
    getText: vi.fn((key: TelegramTemplateKey) => key),
    render: vi.fn(
      (key: TelegramTemplateKey, params: PlainTemplateParams) =>
        `${key}:${Object.values(params).map(String).join('|')}`,
    ),
  };

  beforeEach(async () => {
    vi.stubEnv('MAIN_CHANNEL_ID', '-100200');
    vi.stubEnv('APP_BASE_URL', 'https://app.example');
    vi.stubEnv('EDIT_GIG_URL', 'https://app.example/admin');

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramGigService,
        TelegramGigComposerService,
        TelegramComposerService,
        {
          provide: TelegramBotClient,
          useValue: telegramBotClient,
        },
        {
          provide: TelegramTemplateService,
          useValue: telegramTemplates,
        },
        {
          provide: BucketService,
          useValue: { getPublicFileUrl: vi.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(TelegramGigService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should send a main post and return its Telegram reference', async () => {
    telegramBotClient.sendPhoto.mockResolvedValue({
      message_id: 60,
      date: 1_700_000_000,
      chat: { id: -100200, type: 'channel' },
      photo: [
        {
          file_id: 'main-file-id',
          file_unique_id: 'main-unique-id',
          width: 800,
          height: 800,
        },
      ],
    });

    const result = await service.sendMainPost(createGig());

    expect(result).toEqual({
      messageId: 60,
      chatId: -100200,
      sentAtSeconds: 1_700_000_000,
      fileId: 'main-file-id',
    });
  });

  it('should reject incomplete sent post metadata', async () => {
    telegramBotClient.sendPhoto.mockResolvedValue({
      message_id: Number.NaN,
      date: 1_700_000_000,
      chat: { id: -100200, type: 'channel' },
      photo: [
        {
          file_id: 'main-file-id',
          file_unique_id: 'main-unique-id',
          width: 800,
          height: 800,
        },
      ],
    });

    await expect(service.sendMainPost(createGig())).rejects.toThrow(
      'Telegram sent post reference is incomplete',
    );
  });

  it('should edit a Gig post with replacement media', async () => {
    const gig = createGig();
    const mainPost = {
      to: Messenger.Telegram,
      type: PostType.Main,
      id: 60,
      chatId: -100200,
      date: Date.UTC(2026, 5, 2),
      fileId: 'old-file-id',
    };
    gig.posts = [mainPost];
    const posterFile = {
      buffer: Buffer.from('poster bytes'),
      filename: 'poster.jpg',
      contentType: 'image/jpeg',
    };
    const editedMessage = {
      message_id: mainPost.id,
      date: 1_700_000_001,
      chat: { id: mainPost.chatId, type: 'channel' },
      photo: [
        {
          file_id: 'new-file-id',
          file_unique_id: 'new-unique-id',
          width: 800,
          height: 800,
        },
      ],
    };
    telegramBotClient.editMessageMedia.mockResolvedValue(editedMessage);

    const result = await service.editPost({
      gig,
      post: mainPost,
      isMediaUpdateRequired: true,
      posterFile,
    });

    expect(result).toEqual({
      kind: PostEditKind.Media,
      message: editedMessage,
      fileId: 'new-file-id',
    });
    expect(telegramBotClient.editMessageMedia).toHaveBeenCalledWith(
      expect.any(Object),
      posterFile,
    );
  });

  it('should update a moderation post caption', async () => {
    telegramBotClient.editMessageCaption.mockResolvedValue({
      message_id: 42,
      date: 1_700_000_002,
      chat: { id: -100100, type: 'channel' },
    });

    await service.updateModerationPost({
      moderationPost: { chatId: -100100, messageId: 42 },
      mainPost: { chatId: -100200, messageId: 60 },
      gigId: '507f1f77bcf86cd799439011',
      expectedVersion: 4,
      isVisible: false,
      title: 'Radiohead',
      publicId: 'radiohead-barcelona-2026-06-12',
    });

    expect(telegramBotClient.editMessageCaption).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: -100100,
        messageId: 42,
      }),
    );
  });
});
