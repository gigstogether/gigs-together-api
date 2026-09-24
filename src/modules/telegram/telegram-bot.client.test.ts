import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import type { TGMessage } from './types/message.types';
import { TGInputMediaType } from './types/message.types';
import {
  TelegramBotClient,
  TELEGRAM_CALLBACK_QUERY_NOTIFICATION_MAX_CHARS,
} from './telegram-bot.client';

describe('TelegramBotClient', () => {
  let client: TelegramBotClient;

  const mockHttpService = {
    post: vi.fn(),
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotClient,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    client = module.get<TelegramBotClient>(TelegramBotClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockHttpService.post.mockReset();
    mockHttpService.get.mockReset();
  });

  describe('sendMessage', () => {
    it('should send the correct HTTP request', async () => {
      const chat_id = 12345;
      const text = 'Hello, World!';
      const mockMessage: TGMessage = {
        message_id: 1,
        date: Date.now(),
        chat: { id: chat_id, type: 'private' },
        text,
      };

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: mockMessage,
          },
        }),
      );

      const result = await client.sendMessage({ chat_id, text });

      expect(mockHttpService.post).toHaveBeenCalledWith('sendMessage', {
        chat_id,
        text,
      });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('sendPhoto', () => {
    it('should throw RangeError when photo string is empty', async () => {
      await expect(
        client.sendPhoto({
          chat_id: 1,
          photo: '   ',
          caption: 'ok',
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.sendPhoto({
          chat_id: 1,
          photo: '   ',
          caption: 'ok',
        }),
      ).rejects.toThrow(/non-empty/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should retry a remote photo as multipart and log fallback context when Telegram cannot fetch the URL content', async () => {
      const photoUrl =
        'https://cdn.example/posters/example.svg?signature=secret#preview';
      const telegramDescription = 'Bad Request: failed to get HTTP URL content';
      const sentMessage: TGMessage = {
        message_id: 2,
        date: Date.now(),
        chat: { id: 1, type: 'channel' },
      };
      const loggerSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      mockHttpService.post
        .mockReturnValueOnce(
          throwError(() => ({
            response: {
              data: {
                error_code: 400,
                description: telegramDescription,
              },
            },
          })),
        )
        .mockReturnValueOnce(of({ data: { result: sentMessage } }));
      mockHttpService.get.mockReturnValue(
        of({
          data: new TextEncoder().encode('<svg></svg>').buffer,
          headers: { 'content-type': 'image/svg+xml' },
        }),
      );

      const result = await client.sendPhoto(
        {
          chat_id: 1,
          photo: photoUrl,
          caption: 'Example',
        },
        'gig-candidate-id',
      );

      expect(result).toEqual(sentMessage);
      expect(mockHttpService.get).toHaveBeenCalledWith(photoUrl, {
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
      });
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'event=telegram_photo_url_fallback action=retry_multipart',
        ),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'imageUrl=https://cdn.example/posters/example.svg contentType=image/svg+xml contextId=gig-candidate-id',
        ),
      );
      expect(loggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('signature=secret'),
      );
    });

    it('should safely log a failed remote photo download before sending text fallback', async () => {
      const photoUrl =
        'https://cdn.example/posters/example.jpg?signature=secret#preview';
      const sentMessage: TGMessage = {
        message_id: 3,
        date: Date.now(),
        chat: { id: 1, type: 'channel' },
      };
      const loggerSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      mockHttpService.post
        .mockReturnValueOnce(
          throwError(() => ({
            response: {
              data: {
                error_code: 400,
                description: 'Bad Request: failed to get HTTP URL content',
              },
            },
          })),
        )
        .mockReturnValueOnce(of({ data: { result: sentMessage } }));
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          isAxiosError: true,
          message: 'Request failed with status code 502',
          response: { status: 502 },
        })),
      );

      const result = await client.sendPhoto(
        {
          chat_id: 1,
          photo: photoUrl,
          caption: 'Example',
        },
        'gig-candidate-id',
      );

      expect(result).toEqual(sentMessage);
      expect(loggerSpy).toHaveBeenCalledWith(
        'downloadRemoteFileAsInputFile failed for imageUrl=https://cdn.example/posters/example.jpg contextId=gig-candidate-id: Request failed with status code 502; httpStatus=502',
      );
      expect(loggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('signature=secret'),
      );
    });
  });

  describe('sendMediaGroup', () => {
    it('should throw RangeError when media item count is outside Telegram Bot API limits', async () => {
      await expect(
        client.sendMediaGroup({
          chat_id: 1,
          media: [
            {
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/a.jpg',
            },
          ],
        }),
      ).rejects.toThrow(RangeError);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should send the correct HTTP request', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: [
              {
                message_id: 1,
                date: 1,
                chat: { id: -1001, type: 'channel' },
              },
            ],
          },
        }),
      );

      await client.sendMediaGroup({
        chat_id: 1,
        media: [
          {
            type: TGInputMediaType.Photo,
            media: 'https://cdn.example/a.jpg',
          },
          {
            type: TGInputMediaType.Photo,
            media: 'https://cdn.example/b.jpg',
          },
        ],
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'sendMediaGroup',
        expect.objectContaining({
          chat_id: 1,
          media: expect.any(Array),
        }),
      );
    });
  });

  describe('answerCallbackQuery', () => {
    it('should throw RangeError when notification text exceeds Telegram Bot API limit', async () => {
      const text = 'x'.repeat(
        TELEGRAM_CALLBACK_QUERY_NOTIFICATION_MAX_CHARS + 1,
      );

      await expect(
        client.answerCallbackQuery({
          callback_query_id: 'cq1',
          text,
          show_alert: false,
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.answerCallbackQuery({
          callback_query_id: 'cq1',
          text,
          show_alert: false,
        }),
      ).rejects.toThrow(/answerCallbackQuery text/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });
});
