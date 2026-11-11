import {
  isValidPlaceAliases,
  normalizePlaceAliases,
  normalizePlaceName,
} from './place.validators';

describe('place validators', () => {
  it('should normalize Place names and aliases', () => {
    expect(normalizePlaceName(' Sala Apolo ')).toBe('Sala Apolo');
    expect(normalizePlaceAliases([' Apolo '])).toEqual(['Apolo']);
  });

  it('should accept distinct aliases', () => {
    expect(isValidPlaceAliases('Sala Apolo', ['Apolo', 'Apolo 2'])).toBe(true);
  });

  it('should reject an alias equal to the canonical name', () => {
    expect(isValidPlaceAliases('Sala Apolo', ['SALA APOLO'])).toBe(false);
  });
});
