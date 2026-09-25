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
import { RemoteImageService } from '../remote-image/remote-image.service';

describe('TelegramBotClient', () => {
  let client: TelegramBotClient;

  const mockHttpService = {
    post: vi.fn(),
    get: vi.fn(),
  };
  const remoteImageService = {
    download: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotClient,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: RemoteImageService,
          useValue: remoteImageService,
        },
      ],
    }).compile();

    client = module.get<TelegramBotClient>(TelegramBotClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockHttpService.post.mockReset();
    mockHttpService.get.mockReset();
    remoteImageService.download.mockReset();
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
      remoteImageService.download.mockResolvedValue({
        buffer: Buffer.from('<svg></svg>'),
        contentType: 'image/svg+xml',
      });

      const result = await client.sendPhoto(
        {
          chat_id: 1,
          photo: photoUrl,
          caption: 'Example',
        },
        'gig-candidate-id',
      );

      expect(result).toEqual(sentMessage);
      expect(remoteImageService.download).toHaveBeenCalledWith(photoUrl);
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

    it('should keep the photo post unsent when the remote photo download fails', async () => {
      const photoUrl =
        'https://cdn.example/posters/example.jpg?signature=secret#preview';
      const telegramError = {
        response: {
          data: {
            error_code: 400,
            description: 'Bad Request: failed to get HTTP URL content',
          },
        },
      };
      const loggerSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const sendMessageSpy = vi.spyOn(client, 'sendMessage');

      mockHttpService.post.mockReturnValueOnce(throwError(() => telegramError));
      remoteImageService.download.mockRejectedValue({
        isAxiosError: true,
        message: 'Request failed with status code 502',
        response: { status: 502 },
      });

      await expect(
        client.sendPhoto(
          {
            chat_id: 1,
            photo: photoUrl,
            caption: 'Example',
          },
          'gig-candidate-id',
        ),
      ).rejects.toBe(telegramError);

      expect(loggerSpy).toHaveBeenCalledWith(
        'event=telegram_photo_url_fallback action=download_failed imageUrl=https://cdn.example/posters/example.jpg contextId=gig-candidate-id error=Request failed with status code 502; httpStatus=502',
      );
      expect(loggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('signature=secret'),
      );
      expect(sendMessageSpy).not.toHaveBeenCalled();
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);
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

  describe('editMessageMedia', () => {
    it('should upload replacement photo bytes as multipart media', async () => {
      const editedMessage: TGMessage = {
        message_id: 42,
        date: 1,
        chat: { id: -100123, type: 'channel' },
      };
      const posterFile = {
        buffer: Buffer.from('poster bytes'),
        filename: 'poster.png',
        contentType: 'image/png',
      };
      mockHttpService.post.mockReturnValue(
        of({ data: { result: editedMessage } }),
      );

      await expect(
        client.editMessageMedia(
          {
            chatId: -100123,
            messageId: 42,
            media: {
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/poster.png',
              caption: 'Updated poster',
            },
          },
          posterFile,
        ),
      ).resolves.toEqual(editedMessage);

      const request = mockHttpService.post.mock.calls[0];
      expect(request?.[0]).toBe('editMessageMedia');
      const form = request?.[1];
      const config = request?.[2];
      expect(config).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': expect.stringContaining(
              'multipart/form-data; boundary=',
            ),
          }),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );
      const multipartBody = form.getBuffer().toString('utf8');
      expect(multipartBody).toContain('name="chat_id"');
      expect(multipartBody).toContain('name="message_id"');
      expect(multipartBody).toContain('"media":"attach://poster"');
      expect(multipartBody).toContain('name="poster"; filename="poster.png"');
      expect(multipartBody).toContain('Content-Type: image/png');
      expect(multipartBody).toContain('poster bytes');
      expect(multipartBody).not.toContain('https://cdn.example/poster.png');
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
