import {
  isValidGeographicAliases,
  normalizeGeographicAliases,
  normalizeGeographicName,
  toGeographicSearchKey,
} from './geographic-name.validators';

const CONSTRAINTS = {
  nameMaxLength: 120,
  aliasMaxCount: 20,
};

describe('geographic name validators', () => {
  it('should trim canonical and alias names', () => {
    expect(normalizeGeographicName(' Barcelona ')).toBe('Barcelona');
    expect(normalizeGeographicAliases([' BCN '])).toEqual(['BCN']);
  });

  it('should accept distinct aliases', () => {
    expect(
      isValidGeographicAliases('Barcelona', ['Barna', 'BCN'], CONSTRAINTS),
    ).toBe(true);
  });

  it('should reject an alias equal to the canonical name ignoring case', () => {
    expect(
      isValidGeographicAliases('Barcelona', ['BARCELONA'], CONSTRAINTS),
    ).toBe(false);
  });

  it('should reject duplicate aliases after Unicode normalization', () => {
    expect(
      isValidGeographicAliases('Barcelona', ['ＢＣＮ', 'BCN'], CONSTRAINTS),
    ).toBe(false);
  });

  it('should create the same search key with or without diacritics', () => {
    expect(toGeographicSearchKey(' Olímpic ')).toBe('olimpic');
    expect(toGeographicSearchKey('Olimpic')).toBe('olimpic');
  });

  it('should create the same search key with different separators', () => {
    expect(toGeographicSearchKey('L’Hospitalet')).toBe('lhospitalet');
    expect(toGeographicSearchKey("L'Hospitalet")).toBe('lhospitalet');
    expect(toGeographicSearchKey('L Hospitalet')).toBe('lhospitalet');
    expect(toGeographicSearchKey('LHospitalet')).toBe('lhospitalet');
    expect(toGeographicSearchKey('Paral·lel')).toBe('parallel');
    expect(toGeographicSearchKey('Paral-lel')).toBe('parallel');
  });

  it('should reject an alias that differs only by diacritics', () => {
    expect(isValidGeographicAliases('Bóveda', ['Boveda'], CONSTRAINTS)).toBe(
      false,
    );
  });

  it('should reject an alias that differs only by separators', () => {
    expect(
      isValidGeographicAliases('Paral·lel 62', ['Paral-lel 62'], CONSTRAINTS),
    ).toBe(false);
  });
});
