import {
  CallbackScope,
  GigCallbackAction,
  encodeCallbackData,
  parseCallbackData,
} from './callback-action';

describe('Gig callback data', () => {
  it('should round-trip the required expectedVersion', () => {
    const data = encodeCallbackData({
      scope: CallbackScope.Gig,
      action: GigCallbackAction.Post,
      id: '507f1f77bcf86cd799439011',
      expectedVersion: 7,
    });
    expect(data).toBe('gig:post:507f1f77bcf86cd799439011:7');
    expect(parseCallbackData(data)).toEqual({
      scope: CallbackScope.Gig,
      action: GigCallbackAction.Post,
      id: '507f1f77bcf86cd799439011',
      expectedVersion: 7,
    });
  });

  it('should reject legacy callbacks without expectedVersion', () => {
    expect(parseCallbackData('gig:post:507f1f77bcf86cd799439011')).toBeNull();
  });
});
