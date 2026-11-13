import { isValidIanaTimeZone } from './is-valid-iana-time-zone';

describe('isValidIanaTimeZone', () => {
  it('should accept a supported IANA time zone', () => {
    expect(isValidIanaTimeZone('Europe/Madrid')).toBe(true);
  });

  it('should reject an unsupported time zone', () => {
    expect(isValidIanaTimeZone('Europe/Invalid')).toBe(false);
  });

  it('should reject an empty time zone', () => {
    expect(isValidIanaTimeZone('')).toBe(false);
  });
});
