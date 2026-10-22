import {
  formatTelegramErrorMessage,
  isTelegramChatNotFoundError,
} from './telegram-error';

describe('isTelegramChatNotFoundError', () => {
  it('should return true for the Telegram chat-not-found response', () => {
    const result = isTelegramChatNotFoundError({
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        },
      },
    });

    expect(result).toBe(true);
  });

  it('should return false for another Telegram bad-request response', () => {
    const result = isTelegramChatNotFoundError({
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          ok: false,
          error_code: 400,
          description: 'Bad Request: message is not modified',
        },
      },
    });

    expect(result).toBe(false);
  });
});

describe('formatTelegramErrorMessage', () => {
  it('should include safe Telegram response details for an Axios error', () => {
    const result = formatTelegramErrorMessage({
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          ok: false,
          error_code: 400,
          description: 'Bad Request: failed to get HTTP URL content',
        },
      },
    });

    expect(result).toBe(
      'Request failed with status code 400; httpStatus=400; telegramErrorCode=400; telegramDescription=Bad Request: failed to get HTTP URL content',
    );
  });

  it('should return the message for a standard Error', () => {
    expect(formatTelegramErrorMessage(new Error('Telegram unavailable'))).toBe(
      'Telegram unavailable',
    );
  });

  it('should not stringify an unknown object', () => {
    expect(formatTelegramErrorMessage({ reason: 'unexpected' })).toBe(
      'unknown error',
    );
  });
});
