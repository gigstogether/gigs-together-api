import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BucketService } from '../../bucket/bucket.service';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import { GigCandidateStatus } from '../../gig-candidate/types/gig-candidate-status.enum';
import type {
  GigCandidate,
  GigCandidatePhotoPost,
  GigCandidatePost,
  GigCandidateTextPost,
} from '../../gig-candidate/types/gig-candidate.types';
import { TelegramGigCandidateComposerService } from '../composers/telegram-gig-candidate-composer.service';
import { TelegramBotClient } from '../telegram-bot.client';
import { TelegramPostComposerService } from '../telegram-post-composer.service';
import type { TelegramTemplateKey } from '../telegram-template-keys';
import type { PlainTemplateParams } from '../telegram-template.service';
import { TelegramTemplateService } from '../telegram-template.service';
import { PostEditKind } from '../telegram-post-composer.service.types';
import { TelegramGigCandidateService } from './telegram-gig-candidate.service';

function createGigCandidate(): GigCandidate {
  return {
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
    },
    version: 1,
    status: GigCandidateStatus.New,
    posts: [],
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
  };
}

function createPost(type: PostType.Intake): GigCandidateTextPost;
function createPost(
  type: PostType.Intake | PostType.Moderation,
  fileId: string,
): GigCandidatePhotoPost;
function createPost(
  type: PostType.Intake | PostType.Moderation,
  fileId?: string,
): GigCandidatePost {
  if (fileId === undefined) {
    if (type !== PostType.Intake) {
      throw new Error('A moderation GigCandidate post requires a fileId');
    }
    return {
      to: Messenger.Telegram,
      type,
      date: 1_700_000_000_000,
      id: 40,
      chatId: -100,
    };
  }

  return {
    to: Messenger.Telegram,
    type,
    date: 1_700_000_000_000,
    id: type === PostType.Intake ? 40 : 50,
    chatId: type === PostType.Intake ? -100 : -200,
    fileId,
  };
}

describe('TelegramGigCandidateService', () => {
  let service: TelegramGigCandidateService;

  const telegramBotClientMock = {
    sendMessage: vi.fn(),
    sendPhoto: vi.fn(),
    editMessageText: vi.fn(),
    editMessageCaption: vi.fn(),
    editMessageMedia: vi.fn(),
  };

  const telegramTemplatesMock = {
    getText: vi.fn((_key: TelegramTemplateKey) => 'Button'),
    render: vi.fn(
      (key: TelegramTemplateKey, params: PlainTemplateParams) =>
        `${key}:${Object.values(params).map(String).join('|')}`,
    ),
  };

  beforeEach(async () => {
    vi.stubEnv('INTAKE_CHANNEL_ID', '-100');
    vi.stubEnv('MODERATION_CHANNEL_ID', '-200');
    vi.stubEnv('EDIT_GIG_URL', 'https://app.example/admin');
    vi.stubEnv('APP_BASE_URL', 'https://app.example');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGigCandidateService,
        TelegramGigCandidateComposerService,
        TelegramPostComposerService,
        {
          provide: TelegramBotClient,
          useValue: telegramBotClientMock,
        },
        {
          provide: TelegramTemplateService,
          useValue: telegramTemplatesMock,
        },
        {
          provide: BucketService,
          useValue: { getPublicFileUrl: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(TelegramGigCandidateService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should send an intake text post when the candidate has no poster', async () => {
    telegramBotClientMock.sendMessage.mockResolvedValue({
      message_id: 40,
      date: 1_700_000_000,
      chat: { id: -100, type: 'channel' },
    });

    const result = await service.sendIntakePost(createGigCandidate());

    expect(result).toEqual({
      messageId: 40,
      chatId: -100,
      sentAtSeconds: 1_700_000_000,
    });
    expect(telegramBotClientMock.sendMessage).toHaveBeenCalledOnce();
    expect(telegramBotClientMock.sendPhoto).not.toHaveBeenCalled();
  });

  it('should reject incomplete intake post metadata', async () => {
    telegramBotClientMock.sendMessage.mockResolvedValue({
      message_id: Number.NaN,
      date: 1_700_000_000,
      chat: { id: -100, type: 'channel' },
    });

    await expect(service.sendIntakePost(createGigCandidate())).rejects.toThrow(
      'Telegram sent post reference is incomplete',
    );
  });

  it('should reuse the intake photo for the moderation post', async () => {
    const intakePost = createPost(PostType.Intake, 'intake-file-id');
    const gigCandidate: GigCandidate = {
      ...createGigCandidate(),
      status: GigCandidateStatus.Reviewing,
      posts: [intakePost],
      gigDraft: {
        ...createGigCandidate().gigDraft,
        poster: { externalUrl: 'https://cdn.example/poster.jpg' },
      },
    };
    telegramBotClientMock.sendPhoto.mockResolvedValue({
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

    const result = await service.sendModerationPost(gigCandidate);

    expect(result).toEqual({
      messageId: 50,
      chatId: -200,
      sentAtSeconds: 1_700_000_001,
      fileId: 'moderation-file-id',
    });
    expect(telegramBotClientMock.sendPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ photo: 'intake-file-id' }),
      gigCandidate.id,
    );
  });

  it('should send candidate feedback', async () => {
    const sentMessage = {
      message_id: 60,
      date: 1_700_000_002,
      chat: { id: 42, type: 'private' },
    };
    telegramBotClientMock.sendMessage.mockResolvedValue(sentMessage);

    const result = await service.sendFeedback({
      kind: 'submitted',
      chatId: 42,
      title: 'Band',
    });

    expect(result).toBe(sentMessage);
    expect(telegramBotClientMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: 42 }),
    );
  });

  it('should update a rejected text post', async () => {
    const post = createPost(PostType.Intake);
    const gigCandidate: GigCandidate = {
      ...createGigCandidate(),
      status: GigCandidateStatus.Rejected,
      posts: [post],
    };
    const editedMessage = {
      message_id: post.id,
      date: 1_700_000_003,
      chat: { id: post.chatId, type: 'channel' },
    };
    telegramBotClientMock.editMessageText.mockResolvedValue(editedMessage);

    const result = await service.updateRejectedPost({ gigCandidate, post });

    expect(result).toBe(editedMessage);
    expect(telegramBotClientMock.editMessageText).toHaveBeenCalledOnce();
  });

  it('should update the intake caption after sending to moderation', async () => {
    const intakePost = createPost(PostType.Intake, 'intake-file-id');
    const moderationPost = createPost(
      PostType.Moderation,
      'moderation-file-id',
    );
    const gigCandidate: GigCandidate = {
      ...createGigCandidate(),
      status: GigCandidateStatus.Reviewing,
      posts: [intakePost, moderationPost],
    };
    const editedMessage = {
      message_id: intakePost.id,
      date: 1_700_000_004,
      chat: { id: intakePost.chatId, type: 'channel' },
    };
    telegramBotClientMock.editMessageCaption.mockResolvedValue(editedMessage);

    const result = await service.updateIntakePostAfterModeration({
      gigCandidate,
      intakePost,
      moderationPost,
    });

    expect(result).toBe(editedMessage);
    expect(telegramBotClientMock.editMessageCaption).toHaveBeenCalledOnce();
  });

  it('should replace moderation post media with a prepared poster', async () => {
    const moderationPost = createPost(PostType.Moderation, 'old-file-id');
    const gigCandidate: GigCandidate = {
      ...createGigCandidate(),
      status: GigCandidateStatus.Reviewing,
      posts: [moderationPost],
      gigDraft: {
        ...createGigCandidate().gigDraft,
        poster: { externalUrl: 'https://cdn.example/poster.jpg' },
      },
    };
    const posterFile = {
      buffer: Buffer.from('poster bytes'),
      filename: 'poster.jpg',
      contentType: 'image/jpeg',
    };
    const editedMessage = {
      message_id: moderationPost.id,
      date: 1_700_000_005,
      chat: { id: moderationPost.chatId, type: 'channel' },
      photo: [
        {
          file_id: 'new-file-id',
          file_unique_id: 'new-unique-id',
          width: 800,
          height: 800,
        },
      ],
    };
    telegramBotClientMock.editMessageMedia.mockResolvedValue(editedMessage);

    const result = await service.editPost({
      gigCandidate,
      post: moderationPost,
      isMediaUpdateRequired: true,
      posterFile,
    });

    expect(result).toEqual({
      kind: PostEditKind.Media,
      message: editedMessage,
      fileId: 'new-file-id',
    });
    expect(telegramBotClientMock.editMessageMedia).toHaveBeenCalledWith(
      expect.any(Object),
      posterFile,
    );
  });
});
