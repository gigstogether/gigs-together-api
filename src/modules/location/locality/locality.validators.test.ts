import {
  isValidLocalityAliases,
  isValidLocalityTimeZone,
  normalizeLocalityAliases,
  normalizeLocalityName,
  normalizeLocalityTimeZone,
} from './locality.validators';

describe('locality validators', () => {
  it('should normalize Locality fields', () => {
    expect(normalizeLocalityName(' Barcelona ')).toBe('Barcelona');
    expect(normalizeLocalityAliases([' Barna '])).toEqual(['Barna']);
    expect(normalizeLocalityTimeZone(' Europe/Madrid ')).toBe('Europe/Madrid');
  });

  it('should accept distinct aliases', () => {
    expect(isValidLocalityAliases('Barcelona', ['Barna', 'BCN'])).toBe(true);
  });

  it('should reject an alias equal to the canonical name', () => {
    expect(isValidLocalityAliases('Barcelona', ['BARCELONA'])).toBe(false);
  });

  it('should validate IANA time zones', () => {
    expect(isValidLocalityTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidLocalityTimeZone('Europe/Invalid')).toBe(false);
  });
});
