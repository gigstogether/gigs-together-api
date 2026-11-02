import { Test } from '@nestjs/testing';
import { TelegramDigestComposerService } from './telegram-digest-composer.service';
import type { WeeklyDigestSendPlan } from './telegram-digest-composer.types';
import { WeeklyDigestSendKind } from './telegram-digest-composer.types';
import { TelegramBotClient } from '../telegram-bot-client/telegram-bot.client';
import { TelegramComposerService } from '../telegram-composer.service';
import { TGInputMediaType } from '../telegram-bot-client/types/message.types';
import { TelegramDigestService } from './telegram-digest.service';
import { TelegramDigestSendError } from './telegram-digest.error';
import { TelegramService } from '../telegram.service';

const mediaGroupPlan: WeeklyDigestSendPlan = {
  kind: WeeklyDigestSendKind.SendMediaGroup,
  payload: {
    chat_id: '-1001',
    media: [
      {
        type: TGInputMediaType.Photo,
        media: 'https://cdn.example/alpha.jpg?secret=one',
      },
      {
        type: TGInputMediaType.Photo,
        media: 'https://cdn.example/beta.jpg?secret=two',
      },
    ],
  },
  mediaItems: [
    { position: 1, publicId: 'alpha-2026-01-01' },
    { position: 2, publicId: 'beta-2026-01-02' },
  ],
};

describe('TelegramDigestService', () => {
  let service: TelegramDigestService;

  const telegramBotClient = {
    sendMessage: vi.fn(),
    sendPhoto: vi.fn(),
    sendMediaGroup: vi.fn(),
  };
  const telegramDigestComposer = {
    composeWeeklyDigest: vi.fn(),
  };
  const telegramComposer = {
    buildPostUrl: vi.fn(),
  };
  const telegramService = {
    getMainChannelId: vi.fn().mockReturnValue('-1001'),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramDigestService,
        { provide: TelegramBotClient, useValue: telegramBotClient },
        {
          provide: TelegramDigestComposerService,
          useValue: telegramDigestComposer,
        },
        {
          provide: TelegramComposerService,
          useValue: telegramComposer,
        },
        { provide: TelegramService, useValue: telegramService },
      ],
    }).compile();

    service = moduleRef.get(TelegramDigestService);
    telegramComposer.buildPostUrl.mockReturnValue('https://t.me/c/1/42');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should dispatch a composed message plan', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue({
      kind: WeeklyDigestSendKind.SendMessage,
      payload: { chat_id: '-1001', text: 'No gigs' },
    } satisfies WeeklyDigestSendPlan);
    telegramBotClient.sendMessage.mockResolvedValue({ message_id: 42 });

    await expect(service.sendWeeklyDigestPost([])).resolves.toEqual({
      postUrl: 'https://t.me/c/1/42',
    });
    expect(telegramBotClient.sendMessage).toHaveBeenCalledWith({
      chat_id: '-1001',
      text: 'No gigs',
    });
  });

  it('should dispatch a composed photo plan', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue({
      kind: WeeklyDigestSendKind.SendPhoto,
      payload: { chat_id: '-1001', photo: 'telegram-file-id' },
    } satisfies WeeklyDigestSendPlan);
    telegramBotClient.sendPhoto.mockResolvedValue({ message_id: 42 });

    await service.sendWeeklyDigestPost([]);

    expect(telegramBotClient.sendPhoto).toHaveBeenCalledWith({
      chat_id: '-1001',
      photo: 'telegram-file-id',
    });
  });

  it('should dispatch a composed media group plan', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockResolvedValue([{ message_id: 42 }]);

    await service.sendWeeklyDigestPost([]);

    expect(telegramBotClient.sendMediaGroup).toHaveBeenCalledWith(
      mediaGroupPlan.payload,
    );
  });

  it('should skip sending when the main channel is not configured', async () => {
    telegramService.getMainChannelId.mockReturnValueOnce(undefined);

    await expect(service.sendWeeklyDigestPost([])).resolves.toBeUndefined();
    expect(telegramDigestComposer.composeWeeklyDigest).not.toHaveBeenCalled();
  });

  it('should preserve safe upstream Telegram diagnostics', async () => {
    const upstreamFailure = createDigestUpstreamError();
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(upstreamFailure);

    await expect(service.sendWeeklyDigestPost([])).rejects.toEqual(
      expect.objectContaining({
        name: TelegramDigestSendError.name,
        message:
          'Telegram weekly digest send failed: Bad Request: failed to send message #2 with the error message "WEBPAGE_CURL_FAILED"',
        cause: upstreamFailure,
        providerOperation: 'sendMediaGroup',
        status: 400,
        code: 'ERR_BAD_REQUEST',
        telegramErrorCode: 400,
        telegramDescription:
          'Bad Request: failed to send message #2 with the error message "WEBPAGE_CURL_FAILED"',
      }),
    );
  });

  it('should omit the Telegram token from the serializable error', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(
      createDigestUpstreamError(),
    );

    let thrownError: unknown;
    try {
      await service.sendWeeklyDigestPost([]);
    } catch (e) {
      thrownError = e;
    }
    const serializedError = JSON.stringify(thrownError) ?? '';

    expect({ thrownError, serializedError }).toEqual({
      thrownError: expect.any(TelegramDigestSendError),
      serializedError: expect.not.stringContaining('secret-token'),
    });
  });

  it('should preserve failed media context without URL query data', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(
      createDigestUpstreamError(),
    );

    await expect(service.sendWeeklyDigestPost([])).rejects.toEqual(
      expect.objectContaining({
        telegramError: 'WEBPAGE_CURL_FAILED',
        mediaPosition: 2,
        gigPublicId: 'beta-2026-01-02',
        posterUrl: 'https://cdn.example/beta.jpg',
      }),
    );
  });

  it('should omit media context when the Telegram error format differs', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(
      createDigestUpstreamError('Bad Request: WEBPAGE_CURL_FAILED'),
    );

    await expect(service.sendWeeklyDigestPost([])).rejects.toEqual(
      expect.not.objectContaining({
        telegramError: expect.anything(),
        mediaPosition: expect.anything(),
        gigPublicId: expect.anything(),
        posterUrl: expect.anything(),
      }),
    );
  });
});

function createDigestUpstreamError(
  description = 'Bad Request: failed to send message #2 with the error message "WEBPAGE_CURL_FAILED"',
): unknown {
  return {
    isAxiosError: true,
    code: 'ERR_BAD_REQUEST',
    message: 'Request failed with status code 400',
    config: {
      method: 'post',
      url: 'sendMediaGroup',
      baseURL: 'https://api.telegram.org/bot-secret-token',
    },
    response: {
      status: 400,
      data: {
        ok: false,
        error_code: 400,
        description,
      },
    },
  };
}
