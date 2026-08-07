import * as crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramInitDataAuthExpiredError } from './telegram-init-data.errors';

describe('TelegramAuthService', () => {
  let service: TelegramAuthService;

  beforeEach(() => {
    service = new TelegramAuthService();
    process.env.BOT_TOKEN = 'unit-test-bot-token';
    delete process.env.TELEGRAM_INIT_DATA_MAX_AGE_SEC;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BOT_TOKEN;
    delete process.env.TELEGRAM_INIT_DATA_MAX_AGE_SEC;
  });

  describe('parseTelegramInitDataString', () => {
    it('should build sorted dataCheckString excluding hash when initData has multiple keys', () => {
      const initData = 'hash=abc&auth_date=1&user=%7B%22id%22%3A1%7D';

      const result = service.parseTelegramInitDataString(initData);

      expect(result.parsedData.hash).toBe('abc');
      expect(result.dataCheckString).toBe('auth_date=1\nuser={"id":1}');
    });
  });

  describe('validateTelegramInitData', () => {
    it('should not throw when received hash matches Telegram WebApp algorithm', () => {
      const dataCheckString = 'auth_date=1\nuser={"id":1}';
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(process.env.BOT_TOKEN ?? '')
        .digest();
      const hash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      expect(() =>
        service.validateTelegramInitData(dataCheckString, hash),
      ).not.toThrow();
    });

    it('should throw Error when hash does not match', () => {
      expect(() =>
        service.validateTelegramInitData('auth_date=1', 'deadbeef'),
      ).toThrowError('Invalid initData');
    });
  });

  describe('validateTelegramInitDataAuthDate', () => {
    it('should throw Error when auth_date is missing', () => {
      expect(() =>
        service.validateTelegramInitDataAuthDate(undefined),
      ).toThrowError('Missing auth_date');
    });

    it('should throw TelegramInitDataAuthExpiredError when auth_date is older than max age', () => {
      const authDateSec = 1_700_000_000;
      vi.spyOn(Date, 'now').mockReturnValue((authDateSec + 86_400 + 10) * 1000);

      expect(() =>
        service.validateTelegramInitDataAuthDate(String(authDateSec)),
      ).toThrow(TelegramInitDataAuthExpiredError);
    });

    it('should not throw when auth_date is within max age', () => {
      const authDateSec = 1_700_000_000;
      vi.spyOn(Date, 'now').mockReturnValue((authDateSec + 86_400 - 10) * 1000);

      expect(() =>
        service.validateTelegramInitDataAuthDate(String(authDateSec)),
      ).not.toThrow();
    });
  });
});
