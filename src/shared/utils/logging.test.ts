import { formatErrorMessage } from './logging';

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
