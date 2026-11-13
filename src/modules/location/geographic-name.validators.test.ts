import {
  isValidGeographicAliases,
  normalizeGeographicAliases,
  normalizeGeographicName,
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
});
