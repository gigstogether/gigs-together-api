import {
  isValidRegionAliases,
  normalizeRegionAliases,
  normalizeRegionName,
} from './region.validators';

describe('region validators', () => {
  it('should trim canonical and alias names', () => {
    expect(normalizeRegionName(' Catalonia ')).toBe('Catalonia');
    expect(normalizeRegionAliases([' Catalunya ', ' Cataluña '])).toEqual([
      'Catalunya',
      'Cataluña',
    ]);
  });

  it('should accept distinct aliases', () => {
    expect(isValidRegionAliases('Catalonia', ['Catalunya', 'Cataluña'])).toBe(
      true,
    );
  });

  it('should reject an alias equal to the canonical name ignoring case', () => {
    expect(isValidRegionAliases('Catalonia', ['CATALONIA'])).toBe(false);
  });

  it('should reject duplicate aliases after Unicode normalization', () => {
    expect(isValidRegionAliases('Catalonia', ['Cataluña', 'CATALUÑA'])).toBe(
      false,
    );
  });
});
