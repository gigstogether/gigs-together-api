import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TelegramDigestSendError } from '@modules/telegram/telegram-digest/telegram-digest.error';
import { TelegramDigestService } from '@modules/telegram/telegram-digest/telegram-digest.service';
import { DigestDeliveryError } from '../digest-delivery';
import { TelegramDigestDeliveryAdapter } from './telegram-digest-delivery.adapter';

describe('TelegramDigestDeliveryAdapter', () => {
  let adapter: TelegramDigestDeliveryAdapter;

  const sendWeeklyDigestPostMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestDeliveryAdapter,
        {
          provide: TelegramDigestService,
          useValue: {
            sendWeeklyDigestPost: sendWeeklyDigestPostMock,
          },
        },
      ],
    }).compile();

    adapter = module.get(TelegramDigestDeliveryAdapter);
  });

  it('should return the Telegram delivery result when sending succeeds', async () => {
    const result = { postUrl: 'https://t.me/c/1/42' };
    sendWeeklyDigestPostMock.mockResolvedValue(result);

    await expect(adapter.sendWeeklyDigest([])).resolves.toBe(result);
  });

  it('should translate a Telegram send error into a provider-neutral delivery error', async () => {
    const telegramError = new TelegramDigestSendError({
      message: 'Telegram weekly digest send failed: Bad Request',
      cause: new Error('Request failed with status code 400'),
      providerOperation: 'sendMediaGroup',
      status: 400,
      code: 'ERR_BAD_REQUEST',
      telegramErrorCode: 400,
      telegramDescription: 'Bad Request',
      telegramError: 'WEBPAGE_CURL_FAILED',
      mediaPosition: 2,
      gigPublicId: 'gig-beta',
      posterUrl: 'https://cdn.example/beta.jpg',
    });
    sendWeeklyDigestPostMock.mockRejectedValue(telegramError);

    const deliveryPromise = adapter.sendWeeklyDigest([]);

    await expect(deliveryPromise).rejects.toMatchObject({
      name: DigestDeliveryError.name,
      message: telegramError.message,
      cause: telegramError,
      provider: 'telegram',
      providerOperation: 'sendMediaGroup',
      status: 400,
      code: 'ERR_BAD_REQUEST',
      providerErrorCode: 400,
      providerDescription: 'Bad Request',
      providerFailureCode: 'WEBPAGE_CURL_FAILED',
      failedItemPosition: 2,
      gigPublicId: 'gig-beta',
      mediaUrl: 'https://cdn.example/beta.jpg',
    });
  });

  it('should preserve an unexpected Telegram service error', async () => {
    const unexpectedError = new Error('Unexpected digest composer failure');
    sendWeeklyDigestPostMock.mockRejectedValue(unexpectedError);

    await expect(adapter.sendWeeklyDigest([])).rejects.toBe(unexpectedError);
  });
});
