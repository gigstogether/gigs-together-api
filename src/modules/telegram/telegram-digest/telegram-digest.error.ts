export interface TelegramDigestSendErrorParams {
  message: string;
  cause: unknown;
  providerOperation: string;
  status?: number;
  code?: string | number;
  telegramErrorCode?: number;
  telegramDescription?: string;
  telegramError?: string;
  mediaPosition?: number;
  gigPublicId?: string;
  posterUrl?: string;
}

export class TelegramDigestSendError extends Error {
  cause: unknown;
  providerOperation: string;
  status?: number;
  code?: string | number;
  telegramErrorCode?: number;
  telegramDescription?: string;
  telegramError?: string;
  mediaPosition?: number;
  gigPublicId?: string;
  posterUrl?: string;

  constructor(params: TelegramDigestSendErrorParams) {
    super(params.message);
    this.name = TelegramDigestSendError.name;
    // Keep cause non-enumerable to prevent upstream details from leaking through serialization.
    Object.defineProperty(this, 'cause', {
      value: params.cause,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    this.providerOperation = params.providerOperation;
    if (params.status !== undefined) {
      this.status = params.status;
    }
    if (params.code !== undefined) {
      this.code = params.code;
    }
    if (params.telegramErrorCode !== undefined) {
      this.telegramErrorCode = params.telegramErrorCode;
    }
    if (params.telegramDescription !== undefined) {
      this.telegramDescription = params.telegramDescription;
    }
    if (params.telegramError !== undefined) {
      this.telegramError = params.telegramError;
    }
    if (params.mediaPosition !== undefined) {
      this.mediaPosition = params.mediaPosition;
    }
    if (params.gigPublicId !== undefined) {
      this.gigPublicId = params.gigPublicId;
    }
    if (params.posterUrl !== undefined) {
      this.posterUrl = params.posterUrl;
    }
  }
}
