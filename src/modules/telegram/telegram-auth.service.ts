import { ForbiddenException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { TelegramInitDataAuthExpiredError } from './telegram-init-data.errors';

export interface TelegramInitDataParseResult {
  readonly parsedData: Record<string, string>;
  readonly dataCheckString: string;
}

@Injectable()
export class TelegramAuthService {
  parseTelegramInitDataString(initData: string): TelegramInitDataParseResult {
    const pairs = initData.split('&');
    const parsedData: Record<string, string> = {};

    pairs.forEach((pair) => {
      const [key, value] = pair.split('=');
      parsedData[key] = decodeURIComponent(value);
    });

    const keys = Object.keys(parsedData)
      .filter((key) => key !== 'hash')
      .sort();

    return {
      dataCheckString: keys
        .map((key) => `${key}=${parsedData[key]}`)
        .join('\n'),
      parsedData,
    };
  }

  validateTelegramInitData(
    dataCheckString: string,
    receivedHash: string,
  ): void {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new ForbiddenException('BOT_TOKEN is not configured');
    }

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== receivedHash) {
      throw new Error('Invalid initData');
    }
  }

  /**
   * Rejects initData whose auth_date is too old (replay protection).
   * Default max age 24h; override with TELEGRAM_INIT_DATA_MAX_AGE_SEC.
   */
  validateTelegramInitDataAuthDate(authDateRaw: string | undefined): void {
    if (authDateRaw === undefined || authDateRaw === '') {
      throw new Error('Missing auth_date in Telegram initData');
    }
    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate) || authDate <= 0) {
      throw new Error('Invalid auth_date in Telegram initData');
    }
    this.rejectTelegramAuthDateIfExpired(authDate);
  }

  /**
   * Replay protection: rejects Unix `auth_date` older than TELEGRAM_INIT_DATA_MAX_AGE_SEC
   * (default 86_400 s = 24 h = 1_440 min).
   */
  private rejectTelegramAuthDateIfExpired(authDateSec: number): void {
    // Default 86_400 s = 24 h = 1_440 min
    const maxAgeSec = Number(
      process.env.TELEGRAM_INIT_DATA_MAX_AGE_SEC ?? 86_400,
    );
    if (!Number.isFinite(maxAgeSec) || maxAgeSec <= 0) {
      throw new Error('Invalid TELEGRAM_INIT_DATA_MAX_AGE_SEC');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDateSec > maxAgeSec) {
      throw new TelegramInitDataAuthExpiredError();
    }
  }
}
