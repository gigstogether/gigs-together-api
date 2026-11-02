import { ConsoleLogger, Logger } from '@nestjs/common';
import { formatErrorMessage, logError } from './logging';

describe('formatErrorMessage', () => {
  it('should include the HTTP status for an Axios error', () => {
    const result = formatErrorMessage({
      isAxiosError: true,
      message: 'Request failed with status code 503',
      response: { status: 503 },
    });

    expect(result).toBe('Request failed with status code 503; httpStatus=503');
  });

  it('should return the message for a standard Error', () => {
    expect(formatErrorMessage(new Error('Integration unavailable'))).toBe(
      'Integration unavailable',
    );
  });

  it('should not stringify an unknown object', () => {
    expect(formatErrorMessage({ reason: 'unexpected' })).toBe('unknown error');
  });
});

describe('logError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should preserve the logger context without passing a second positional context', () => {
    const consoleLoggerErrorSpy = vi
      .spyOn(ConsoleLogger.prototype, 'error')
      .mockImplementation(() => undefined);
    const logger = new Logger('OwningService');
    const e = new Error('Operation failed');

    logError(logger, {
      error: e,
      note: 'Application operation failed',
      context: 'OriginatingService',
    });

    expect(consoleLoggerErrorSpy).toHaveBeenCalledOnce();
    expect(consoleLoggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'OriginatingService',
        message: e.message,
      }),
      e.stack,
      'OwningService',
    );
  });
});
