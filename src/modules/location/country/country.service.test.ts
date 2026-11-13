import { CountryService } from './country.service';

describe('CountryService', () => {
  const service = new CountryService();

  it('should return the complete ordered ISO country catalog', () => {
    const countries = service.getCountries();

    expect(countries).toHaveLength(249);
    expect(countries[0]).toEqual({ iso: 'ES' });
    expect(countries[countries.length - 1]).toEqual({ iso: 'ZW' });
  });

  it('should return independent country objects', () => {
    const firstResult = service.getCountries();

    firstResult[0].iso = 'ZZ';

    expect(service.getCountries()[0]).toEqual({ iso: 'ES' });
  });

  it('should accept a current ISO 3166-1 alpha-2 code', () => {
    expect(service.hasCountry('FR')).toBe(true);
  });

  it('should reject an unknown or incorrectly cased code', () => {
    expect(service.hasCountry('ZZ')).toBe(false);
    expect(service.hasCountry('fr')).toBe(false);
  });
});
