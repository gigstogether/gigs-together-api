import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TelegramDigestComposerService } from '../composers/telegram-digest-composer.service';
import type { WeeklyDigestSendPlan } from '../composers/telegram-digest-composer.types';
import { WeeklyDigestSendKind } from '../composers/telegram-digest-composer.types';
import { TelegramBotClient } from '../telegram-bot.client';
import { TelegramPostComposerService } from '../telegram-post-composer.service';
import { TGInputMediaType } from '../types/message.types';
import { TelegramDigestService } from './telegram-digest.service';

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
  const telegramPostComposer = {
    getPostUrl: vi.fn(),
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
          provide: TelegramPostComposerService,
          useValue: telegramPostComposer,
        },
      ],
    }).compile();

    service = moduleRef.get(TelegramDigestService);
    process.env.MAIN_CHANNEL_ID = '-1001';
    telegramPostComposer.getPostUrl.mockReturnValue('https://t.me/c/1/42');
  });

  afterEach(() => {
    delete process.env.MAIN_CHANNEL_ID;
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
    delete process.env.MAIN_CHANNEL_ID;

    await expect(service.sendWeeklyDigestPost([])).resolves.toBeUndefined();
    expect(telegramDigestComposer.composeWeeklyDigest).not.toHaveBeenCalled();
  });

  it('should replace an upstream Telegram error', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(
      createDigestUpstreamError(),
    );
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.sendWeeklyDigestPost([])).rejects.toThrow(
      'Weekly digest send to main channel failed',
    );
  });

  it('should omit the Telegram token from a failure log', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(
      createDigestUpstreamError(),
    );
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(service.sendWeeklyDigestPost([])).rejects.toThrow();

    expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain(
      'secret-token',
    );
  });

  it('should log failed media context without URL query data', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(
      createDigestUpstreamError(),
    );
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(service.sendWeeklyDigestPost([])).rejects.toThrow();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: {
          telegramError: 'WEBPAGE_CURL_FAILED',
          position: 2,
          publicId: 'beta-2026-01-02',
          posterUrl: 'https://cdn.example/beta.jpg',
        },
      }),
    );
  });

  it('should omit media context when the Telegram error format differs', async () => {
    telegramDigestComposer.composeWeeklyDigest.mockReturnValue(mediaGroupPlan);
    telegramBotClient.sendMediaGroup.mockRejectedValue(
      createDigestUpstreamError('Bad Request: WEBPAGE_CURL_FAILED'),
    );
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(service.sendWeeklyDigestPost([])).rejects.toThrow();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ meta: expect.anything() }),
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
