import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import type {
  InputFile,
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageReplyMarkup,
  TGEditMessageText,
  TGMessage,
  TGSendMediaGroup,
  TGSendMessage,
  TGSendPhoto,
} from './types/message.types';
import type { TGChat } from './types/chat.types';
import type { TGAnswerCallbackQuery } from './types/update.types';

export const TELEGRAM_CALLBACK_QUERY_NOTIFICATION_MAX_CHARS = 200;
export const TELEGRAM_MEDIA_GROUP_MIN_ITEMS = 2;
export const TELEGRAM_MEDIA_GROUP_MAX_ITEMS = 10;

/**
 * Low-level Telegram Bot HTTP adapter around `api.telegram.org`.
 *
 * Registered as a NestJS injectable provider (same lifecycle/DI mechanics as a typical
 * `*Service`), but named **Client** to reflect its role: a thin outbound adapter to the
 * external Bot API rather than application/domain orchestration.
 *
 * Dependency injection supplies {@link HttpService} only; logging relies on Nest's
 * {@link Logger} constructed with this class name (no separate logger provider).
 *
 * Does not assert caption/message UTF-16 length when formatting may apply — Telegram counts
 * after entity parsing. Keeps unambiguous checks: {@link answerCallbackQuery} plain {@code text},
 * {@link sendMediaGroup} item bounds, non-empty {@link sendPhoto} reference.
 */
@Injectable()
export class TelegramBotClient {
  private readonly logger = new Logger(TelegramBotClient.name);

  constructor(private readonly httpService: HttpService) {}

  async sendMessage(payload: TGSendMessage): Promise<TGMessage> {
    const res$ = this.httpService.post('sendMessage', payload);
    const res = await firstValueFrom(res$);
    return res.data.result;
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
        if (this.isWrongWebPageContentError(e) && this.isHttpUrl(photo)) {
          const downloaded = await this.downloadRemoteFileAsInputFile(
            photo,
            gigId,
          );
          if (downloaded) {
            return this.sendPhoto({ ...payload, photo: downloaded }, gigId);
          }

          // Last resort: send a text-only message so posting doesn't silently fail.
          const text =
            payload.caption ??
            (payload as unknown as { text?: string }).text ??
            photo;
          return this.sendMessage({ chat_id: payload.chat_id, text });
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
    if (Buffer.isBuffer(photo)) {
      form.append('photo', photo, { filename });
    } else if (typeof photo.buffer !== 'undefined') {
      form.append('photo', photo.buffer, {
        filename: photo.filename,
        contentType: photo.contentType,
      });
    } else {
      form.append('photo', photo, { filename });
    }

    const res$ = this.httpService.post('sendPhoto', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const res = await firstValueFrom(res$);
    return res.data.result;
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

  private isWrongWebPageContentError(e: any): boolean {
    const data = e?.response?.data;
    const description: string | undefined = data?.description;
    const errorCode: number | undefined = data?.error_code;
    return (
      errorCode === 400 &&
      typeof description === 'string' &&
      /wrong type of the web page content/i.test(description)
    );
  }

  private async downloadRemoteFileAsInputFile(
    url: string,
    gigId?: string,
  ): Promise<InputFile | undefined> {
    try {
      const res$ = this.httpService.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
      });
      const res = await firstValueFrom(res$);

      const contentType = (res.headers?.['content-type'] ??
        res.headers?.['Content-Type']) as string | undefined;

      // If it's clearly not an image, don't try to upload it as a photo.
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        this.logger.warn(
          `downloadRemoteFileAsInputFile: non-image content-type (${contentType}) for ${url}`,
        );
        return;
      }

      const buffer = Buffer.from(res.data);
      // TODO: ??
      const filename =
        this.guessFilenameFromUrl(url) ?? `poster${gigId ?? ''}.jpg`;

      return { buffer, filename, contentType };
    } catch (e) {
      this.logger.warn(
        `downloadRemoteFileAsInputFile error: ${JSON.stringify(
          e?.response?.data ?? e,
        )}`,
      );
      return;
    }
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

  async editMessageMedia(payload: TGEditMessageMedia): Promise<TGMessage> {
    const { chatId, messageId, media, replyMarkup } = payload;

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
