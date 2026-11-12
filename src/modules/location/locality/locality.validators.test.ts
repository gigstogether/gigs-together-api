import {
  isValidLocalityAliases,
  isValidLocalityQualifier,
  isValidLocalityTimeZone,
  normalizeLocalityAliases,
  normalizeLocalityName,
  normalizeLocalityQualifier,
  normalizeLocalityTimeZone,
} from './locality.validators';

describe('locality validators', () => {
  it('should normalize Locality fields', () => {
    expect(normalizeLocalityName(' Barcelona ')).toBe('Barcelona');
    expect(normalizeLocalityQualifier(' Barcelona province ')).toBe(
      'Barcelona province',
    );
    expect(normalizeLocalityAliases([' Barna '])).toEqual(['Barna']);
    expect(normalizeLocalityTimeZone(' Europe/Madrid ')).toBe('Europe/Madrid');
  });

  it('should validate an optional qualifier', () => {
    expect(isValidLocalityQualifier(undefined)).toBe(true);
    expect(isValidLocalityQualifier('Barcelona province')).toBe(true);
    expect(isValidLocalityQualifier('')).toBe(false);
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
