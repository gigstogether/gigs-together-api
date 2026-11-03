import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import type {
  InputFile,
  InputFileData,
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageReplyMarkup,
  TGEditMessageText,
  TGFile,
  TGMessage,
  TGSendMediaGroup,
  TGSendMessage,
  TGSendPhoto,
  TGSetMessageReaction,
} from './types/message.types';
import type { TGChat } from './types/chat.types';
import type { TGAnswerCallbackQuery } from './types/update.types';
import type { TGUser } from './types/user.types';
import { isRecord } from '@shared/utils/is-record';
import { formatErrorMessage } from '@shared/utils/logging';
import { RemoteImageService } from '../../remote-image/remote-image.service';
import type { DownloadedRemoteImage } from '../../remote-image/remote-image.service';

export const TELEGRAM_CALLBACK_QUERY_NOTIFICATION_MAX_CHARS = 200;
export const TELEGRAM_MEDIA_GROUP_MIN_ITEMS = 2;
export const TELEGRAM_MEDIA_GROUP_MAX_ITEMS = 10;
export const TELEGRAM_BOT_HTTP = Symbol('TELEGRAM_BOT_HTTP');
export const TELEGRAM_FILE_HTTP = Symbol('TELEGRAM_FILE_HTTP');
export const TELEGRAM_FILE_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

interface TelegramGetFileErrorParams {
  message: string;
  cause?: unknown;
  status?: number;
}

export class TelegramGetFileError extends Error {
  readonly operation = 'getFile';
  readonly cause: unknown;
  readonly status?: number;

  constructor(params: TelegramGetFileErrorParams) {
    super(params.message);
    this.name = TelegramGetFileError.name;
    this.cause = params.cause;
    Object.defineProperty(this, 'cause', {
      value: params.cause,
      enumerable: false,
      configurable: true,
    });
    if (params.status !== undefined) {
      this.status = params.status;
    }
  }
}

interface TelegramFileDownloadErrorParams {
  message: string;
  cause?: unknown;
  status?: number;
}

export interface DownloadedTelegramFile {
  buffer: Buffer;
  contentType?: string;
}

export class TelegramFileDownloadError extends Error {
  readonly operation = 'downloadFile';
  readonly cause: unknown;
  readonly status?: number;

  constructor(params: TelegramFileDownloadErrorParams) {
    super(params.message);
    this.name = TelegramFileDownloadError.name;
    this.cause = params.cause;
    Object.defineProperty(this, 'cause', {
      value: params.cause,
      enumerable: false,
      configurable: true,
    });
    if (params.status !== undefined) {
      this.status = params.status;
    }
  }
}

interface TelegramBotErrorData {
  errorCode: number;
  description: string;
}

/**
 * Low-level Telegram Bot HTTP adapter around `api.telegram.org`.
 *
 * Registered as a NestJS injectable provider (same lifecycle/DI mechanics as a typical
 * `*Service`), but named **Client** to reflect its role: a thin outbound adapter to the
 * external Bot API rather than application/domain orchestration.
 *
 * Dependency injection supplies {@link HttpService} and {@link RemoteImageService}; logging
 * relies on Nest's {@link Logger} constructed with this class name (no separate logger provider).
 *
 * Does not assert caption/message UTF-16 length when formatting may apply — Telegram counts
 * after entity parsing. Keeps unambiguous checks: {@link answerCallbackQuery} plain {@code text},
 * {@link sendMediaGroup} item bounds, non-empty {@link sendPhoto} reference.
 */
@Injectable()
export class TelegramBotClient {
  private readonly logger = new Logger(TelegramBotClient.name);

  constructor(
    @Inject(TELEGRAM_BOT_HTTP)
    private readonly httpService: HttpService,
    @Inject(TELEGRAM_FILE_HTTP)
    private readonly fileHttpService: HttpService,
    private readonly remoteImageService: RemoteImageService,
  ) {}

  async getMe(): Promise<TGUser> {
    const res$ = this.httpService.get('getMe');
    const res = await firstValueFrom(res$);
    return res.data.result;
  }

  async getFile(fileId: string): Promise<TGFile> {
    if (fileId.trim() === '') {
      throw new TelegramGetFileError({
        message: 'Telegram file id is required',
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>('getFile', {
          params: { file_id: fileId },
        }),
      );
      return this.parseTelegramFileResponse(response.data);
    } catch (e) {
      if (e instanceof TelegramGetFileError) {
        throw e;
      }
      throw new TelegramGetFileError({
        message: 'Telegram getFile request failed',
        cause: e,
        status: this.getHttpStatus(e),
      });
    }
  }

  async downloadByFileId(fileId: string): Promise<DownloadedTelegramFile> {
    const file = await this.getFile(fileId);
    if (
      file.file_size !== undefined &&
      file.file_size > TELEGRAM_FILE_DOWNLOAD_MAX_BYTES
    ) {
      throw new TelegramFileDownloadError({
        message: `Telegram file exceeds the ${TELEGRAM_FILE_DOWNLOAD_MAX_BYTES}-byte download limit`,
      });
    }

    const filePath = file.file_path;
    if (filePath === undefined) {
      throw new TelegramFileDownloadError({
        message: 'Telegram getFile response has no file path',
      });
    }
    const downloadPath = this.buildDownloadPath(filePath);

    try {
      const response = await firstValueFrom(
        this.fileHttpService.get<unknown>(downloadPath, {
          responseType: 'arraybuffer',
          maxContentLength: TELEGRAM_FILE_DOWNLOAD_MAX_BYTES,
        }),
      );
      const buffer = this.parseDownloadedFileBuffer(response.data);
      if (buffer.length > TELEGRAM_FILE_DOWNLOAD_MAX_BYTES) {
        throw new TelegramFileDownloadError({
          message: `Telegram file exceeds the ${TELEGRAM_FILE_DOWNLOAD_MAX_BYTES}-byte download limit`,
        });
      }

      const result: DownloadedTelegramFile = { buffer };
      const contentTypeHeader: unknown = response.headers['content-type'];
      if (
        typeof contentTypeHeader === 'string' &&
        contentTypeHeader.trim() !== ''
      ) {
        result.contentType = contentTypeHeader.trim();
      }
      return result;
    } catch (e) {
      if (e instanceof TelegramFileDownloadError) {
        throw e;
      }
      throw new TelegramFileDownloadError({
        message: 'Telegram file download failed',
        cause: e,
        status: this.getHttpStatus(e),
      });
    }
  }

  async sendMessage(payload: TGSendMessage): Promise<TGMessage> {
    const res$ = this.httpService.post('sendMessage', payload);
    const res = await firstValueFrom(res$);
    return res.data.result;
  }

  async setMessageReaction(payload: TGSetMessageReaction): Promise<void> {
    await firstValueFrom(this.httpService.post('setMessageReaction', payload));
  }

  async sendPhoto(
    payload: TGSendPhoto,
    gigId = '',
  ): Promise<TGMessage | undefined> {
    if (!payload) {
      throw new Error('No payload in sendPhoto');
    }
    const { photo, reply_markup, ...rest } = payload;

    if (!TelegramBotClient.isNonEmptyPhotoInput(photo)) {
      throw new RangeError(
        'sendPhoto: photo must be a non-empty URL, file_id string, or uploaded file bytes',
      );
    }

    if (this.isPhotoString(photo)) {
      try {
        const res$ = this.httpService.post('sendPhoto', payload);
        const res = await firstValueFrom(res$);
        return res.data.result;
      } catch (e) {
        // Telegram can't fetch the file from the provided URL (often HTML/redirect/webp/etc).
        const telegramErrorData = this.getTelegramBotErrorData(e);
        if (
          this.isRemotePhotoUrlError(telegramErrorData) &&
          this.isHttpUrl(photo)
        ) {
          let remoteImage: DownloadedRemoteImage;
          try {
            remoteImage = await this.remoteImageService.download(photo);
          } catch (downloadE) {
            // Remove query and hash so signed URLs and sensitive access parameters never reach logs.
            this.logger.warn(
              `event=telegram_photo_url_fallback action=download_failed imageUrl=${this.getUrlWithoutQueryOrHash(photo)} contextId=${gigId || 'none'} error=${formatErrorMessage(downloadE)}`,
            );
            throw e;
          }

          const downloaded: InputFileData = {
            buffer: remoteImage.buffer,
            filename: this.guessFilenameFromUrl(photo) ?? `poster${gigId}.jpg`,
          };
          if (remoteImage.contentType !== undefined) {
            downloaded.contentType = remoteImage.contentType;
          }
          this.logger.warn(
            `event=telegram_photo_url_fallback action=retry_multipart imageUrl=${this.getUrlWithoutQueryOrHash(photo)} contentType=${downloaded.contentType ?? 'unknown'} contextId=${gigId || 'none'} telegramDescription=${telegramErrorData.description}`,
          );
          return this.sendPhoto({ ...payload, photo: downloaded }, gigId);
        }
        throw e;
      }
    }

    // Buffer/Stream — multipart/form-data
    const form = new FormData();
    // form.append('chat_id', String(payload.chat_id));
    if (reply_markup) form.append('reply_markup', JSON.stringify(reply_markup));

    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }

    // TODO: jpg ?
    const filename = `poster${gigId}.jpg`;
    this.appendInputFile(form, 'photo', photo, filename);

    const res$ = this.httpService.post('sendPhoto', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const res = await firstValueFrom(res$);
    return res.data.result;
  }

  private appendInputFile(
    form: FormData,
    fieldName: string,
    file: InputFile,
    defaultFilename: string,
  ): void {
    if (Buffer.isBuffer(file)) {
      form.append(fieldName, file, { filename: defaultFilename });
      return;
    }

    form.append(fieldName, file.buffer, {
      filename: file.filename,
      contentType: file.contentType,
    });
  }

  async sendMediaGroup(payload: TGSendMediaGroup): Promise<TGMessage[]> {
    const { chat_id, media } = payload;
    if (
      media.length < TELEGRAM_MEDIA_GROUP_MIN_ITEMS ||
      media.length > TELEGRAM_MEDIA_GROUP_MAX_ITEMS
    ) {
      throw new RangeError(
        `sendMediaGroup expects ${TELEGRAM_MEDIA_GROUP_MIN_ITEMS}–${TELEGRAM_MEDIA_GROUP_MAX_ITEMS} media items, got ${media.length}`,
      );
    }

    const res = await firstValueFrom(
      this.httpService.post('sendMediaGroup', {
        chat_id,
        media,
      }),
    );
    return res.data.result;
  }

  private isPhotoString(photo: string | InputFile): photo is string {
    return typeof photo === 'string';
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private getTelegramBotErrorData(
    e: unknown,
  ): TelegramBotErrorData | undefined {
    if (!isRecord(e)) {
      return;
    }

    const response = e.response;
    if (!isRecord(response)) {
      return;
    }

    const data = response.data;
    if (!isRecord(data)) {
      return;
    }

    const errorCode = data.error_code;
    const description = data.description;
    if (typeof errorCode !== 'number' || typeof description !== 'string') {
      return;
    }

    return { errorCode, description };
  }

  private isRemotePhotoUrlError(
    telegramErrorData: TelegramBotErrorData | undefined,
  ): telegramErrorData is TelegramBotErrorData {
    if (!telegramErrorData || telegramErrorData.errorCode !== 400) {
      return false;
    }

    return (
      /wrong type of the web page content/i.test(
        telegramErrorData.description,
      ) || /failed to get HTTP URL content/i.test(telegramErrorData.description)
    );
  }

  private parseTelegramFileResponse(data: unknown): TGFile {
    if (!isRecord(data) || data.ok !== true || !isRecord(data.result)) {
      throw new TelegramGetFileError({
        message: 'Telegram getFile response is invalid',
      });
    }

    const result = data.result;
    const fileId = result.file_id;
    const fileUniqueId = result.file_unique_id;
    if (
      typeof fileId !== 'string' ||
      fileId.trim() === '' ||
      typeof fileUniqueId !== 'string' ||
      fileUniqueId.trim() === ''
    ) {
      throw new TelegramGetFileError({
        message: 'Telegram getFile response has invalid file identifiers',
      });
    }

    const file: TGFile = {
      file_id: fileId,
      file_unique_id: fileUniqueId,
    };
    const fileSize = result.file_size;
    if (fileSize !== undefined) {
      if (
        typeof fileSize !== 'number' ||
        !Number.isSafeInteger(fileSize) ||
        fileSize < 0
      ) {
        throw new TelegramGetFileError({
          message: 'Telegram getFile response has an invalid file size',
        });
      }
      file.file_size = fileSize;
    }

    const filePath = result.file_path;
    if (filePath !== undefined) {
      if (typeof filePath !== 'string' || filePath.trim() === '') {
        throw new TelegramGetFileError({
          message: 'Telegram getFile response has an invalid file path',
        });
      }
      file.file_path = filePath;
    }
    return file;
  }

  private getHttpStatus(e: unknown): number | undefined {
    if (!isRecord(e) || !isRecord(e.response)) {
      return;
    }
    const status = e.response.status;
    return typeof status === 'number' && Number.isInteger(status)
      ? status
      : undefined;
  }

  private buildDownloadPath(filePath: string): string {
    const segments = filePath.split('/');
    const isInvalidPath =
      filePath.startsWith('/') ||
      filePath.includes('\\') ||
      filePath.includes('?') ||
      filePath.includes('#') ||
      segments.some(
        (segment) => segment === '' || segment === '.' || segment === '..',
      );
    if (isInvalidPath) {
      throw new TelegramFileDownloadError({
        message: 'Telegram getFile response has an invalid file path',
      });
    }

    return segments.map((segment) => encodeURIComponent(segment)).join('/');
  }

  private parseDownloadedFileBuffer(data: unknown): Buffer {
    if (Buffer.isBuffer(data)) {
      if (data.length === 0) {
        throw new TelegramFileDownloadError({
          message: 'Telegram returned an empty file',
        });
      }
      return data;
    }
    if (data instanceof ArrayBuffer) {
      const buffer = Buffer.from(data);
      if (buffer.length === 0) {
        throw new TelegramFileDownloadError({
          message: 'Telegram returned an empty file',
        });
      }
      return buffer;
    }
    throw new TelegramFileDownloadError({
      message: 'Telegram returned an invalid file body',
    });
  }

  private getUrlWithoutQueryOrHash(url: string): string {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  }

  private guessFilenameFromUrl(url: string): string | undefined {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop();
      if (!last) return;
      // Avoid super-long filenames / query-ish blobs.
      return last.length > 200 ? undefined : last;
    } catch {
      return;
    }
  }

  async answerCallbackQuery(payload: TGAnswerCallbackQuery): Promise<void> {
    const { callback_query_id, text, show_alert } = payload;

    TelegramBotClient.assertUtf16LengthAtMost(
      text,
      TELEGRAM_CALLBACK_QUERY_NOTIFICATION_MAX_CHARS,
      'answerCallbackQuery text',
    );

    await firstValueFrom(
      this.httpService.post('answerCallbackQuery', {
        callback_query_id,
        text,
        show_alert,
      }),
    );
  }

  async editMessageReplyMarkup(
    payload: TGEditMessageReplyMarkup,
  ): Promise<TGMessage> {
    const { chatId, messageId, replyMarkup } = payload;
    const res = await firstValueFrom(
      this.httpService.post('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    );
    return res.data.result;
  }

  async editMessageText(payload: TGEditMessageText): Promise<TGMessage> {
    const {
      chatId,
      messageId,
      text,
      replyMarkup,
      parseMode,
      disableWebPagePreview,
    } = payload;

    const res = await firstValueFrom(
      this.httpService.post('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: disableWebPagePreview,
        reply_markup: replyMarkup,
      }),
    );
    return res.data.result;
  }

  async editMessageCaption(payload: TGEditMessageCaption): Promise<TGMessage> {
    const {
      chatId,
      messageId,
      caption,
      replyMarkup,
      parseMode,
      disableWebPagePreview,
    } = payload;

    const res = await firstValueFrom(
      this.httpService.post('editMessageCaption', {
        chat_id: chatId,
        message_id: messageId,
        caption,
        parse_mode: parseMode,
        disable_web_page_preview: disableWebPagePreview,
        reply_markup: replyMarkup,
      }),
    );

    return res.data.result;
  }

  async editMessageMedia(
    payload: TGEditMessageMedia,
    posterFile?: InputFileData,
  ): Promise<TGMessage> {
    const { chatId, messageId, media, replyMarkup } = payload;

    if (posterFile !== undefined) {
      if (media === undefined) {
        throw new Error(
          'editMessageMedia: media payload is required for multipart upload',
        );
      }

      const mediaAttachName = 'poster';
      const form = new FormData();
      if (chatId !== undefined) {
        form.append('chat_id', String(chatId));
      }
      if (messageId !== undefined) {
        form.append('message_id', String(messageId));
      }
      form.append(
        'media',
        JSON.stringify({
          ...media,
          media: `attach://${mediaAttachName}`,
        }),
      );
      if (replyMarkup !== undefined) {
        form.append('reply_markup', JSON.stringify(replyMarkup));
      }
      this.appendInputFile(
        form,
        mediaAttachName,
        posterFile,
        posterFile.filename,
      );

      const res = await firstValueFrom(
        this.httpService.post('editMessageMedia', form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );
      return res.data.result;
    }

    const res = await firstValueFrom(
      this.httpService.post('editMessageMedia', {
        chat_id: chatId,
        message_id: messageId,
        media,
        reply_markup: replyMarkup,
      }),
    );

    return res.data.result;
  }

  async getChat(chatIdOrUsername: number | string): Promise<TGChat> {
    const res$ = this.httpService.get('getChat', {
      params: { chat_id: chatIdOrUsername },
    });
    const { data } = await firstValueFrom(res$);
    return data.result;
  }

  private static assertUtf16LengthAtMost(
    value: string | undefined,
    max: number,
    label: string,
  ): void {
    if (value !== undefined && value.length > max) {
      throw new RangeError(
        `${label} must be at most ${max} characters (Telegram Bot API limit), got ${value.length}`,
      );
    }
  }

  /**
   * Rejects empty references Bot API cannot send as `photo` (URL/file_id must be non-empty;
   * uploaded buffers must contain bytes).
   */
  private static isNonEmptyPhotoInput(photo: string | InputFile): boolean {
    if (typeof photo === 'string') {
      return photo.trim().length > 0;
    }
    if (Buffer.isBuffer(photo)) {
      return photo.length > 0;
    }
    if ('buffer' in photo && Buffer.isBuffer(photo.buffer)) {
      return photo.buffer.length > 0;
    }
    return false;
  }
}
