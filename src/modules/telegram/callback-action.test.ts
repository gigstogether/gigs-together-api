import {
  CallbackScope,
  encodeCallbackData,
  GigCallbackAction,
  parseCallbackData,
  TELEGRAM_CALLBACK_DATA_MAX_CHARS,
} from './callback-action';

describe('encodeCallbackData', () => {
  it('should encode gig approve callback as scope:action:id', () => {
    expect(
      encodeCallbackData({
        scope: CallbackScope.Gig,
        action: GigCallbackAction.Approve,
        id: '507f1f77bcf86cd799439011',
      }),
    ).toBe('gig:approve:507f1f77bcf86cd799439011');
  });

  it('should throw when id is empty', () => {
    expect(() =>
      encodeCallbackData({
        scope: CallbackScope.Gig,
        action: GigCallbackAction.Post,
        id: '   ',
      }),
    ).toThrow('callback_data id must be a non-empty string');
  });

  it('should throw when id contains a colon', () => {
    expect(() =>
      encodeCallbackData({
        scope: CallbackScope.Gig,
        action: GigCallbackAction.Reject,
        id: 'a:b',
      }),
    ).toThrow('callback_data id must not contain ":"');
  });

  it('should throw when encoded data exceeds Telegram limit', () => {
    const longId = 'x'.repeat(TELEGRAM_CALLBACK_DATA_MAX_CHARS);

    expect(() =>
      encodeCallbackData({
        scope: CallbackScope.Gig,
        action: GigCallbackAction.Approve,
        id: longId,
      }),
    ).toThrow(
      `callback_data exceeds Telegram limit of ${TELEGRAM_CALLBACK_DATA_MAX_CHARS} characters`,
    );
  });
});

describe('parseCallbackData', () => {
  it('should parse a valid gig callback', () => {
    expect(parseCallbackData('gig:post:507f1f77bcf86cd799439011')).toEqual({
      scope: CallbackScope.Gig,
      action: GigCallbackAction.Post,
      id: '507f1f77bcf86cd799439011',
    });
  });

  it('should reject the removed unreleased gigCandidate callback contract', () => {
    expect(
      parseCallbackData('gigCandidate:reject:507f1f77bcf86cd799439099'),
    ).toBeNull();
  });

  it('should return null for legacy flat action:id payloads', () => {
    expect(parseCallbackData('approve:507f1f77bcf86cd799439011')).toBeNull();
  });

  it('should return null for unknown scope', () => {
    expect(
      parseCallbackData('other:approve:507f1f77bcf86cd799439011'),
    ).toBeNull();
  });

  it('should return null for unknown action in a known scope', () => {
    expect(parseCallbackData('gig:accept:507f1f77bcf86cd799439011')).toBeNull();
  });

  it('should return null when segment count is not exactly three', () => {
    expect(parseCallbackData('gig:approve')).toBeNull();
    expect(
      parseCallbackData('gig:approve:507f1f77bcf86cd799439011:extra'),
    ).toBeNull();
  });

  it('should return null when id is empty', () => {
    expect(parseCallbackData('gig:approve:')).toBeNull();
  });
});
