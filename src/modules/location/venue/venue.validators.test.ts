import {
  isValidVenueAliases,
  normalizeVenueAliases,
  normalizeVenueName,
} from './venue.validators';

describe('venue validators', () => {
  it('should normalize Venue names and aliases', () => {
    expect(normalizeVenueName(' Sala Apolo ')).toBe('Sala Apolo');
    expect(normalizeVenueAliases([' Apolo '])).toEqual(['Apolo']);
  });

  it('should accept distinct aliases', () => {
    expect(isValidVenueAliases('Sala Apolo', ['Apolo', 'Apolo 2'])).toBe(true);
  });

  it('should reject an alias equal to the canonical name', () => {
    expect(isValidVenueAliases('Sala Apolo', ['SALA APOLO'])).toBe(false);
  });
});
