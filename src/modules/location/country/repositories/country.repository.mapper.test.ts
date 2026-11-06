import { CountryRepositoryMapper } from './country.repository.mapper';

describe('CountryRepositoryMapper', () => {
  it('should map a stored country to the domain model', () => {
    expect(CountryRepositoryMapper.toCountry({ iso: 'ES' })).toEqual({
      iso: 'ES',
    });
  });

  it('should reject an invalid stored country iso', () => {
    expect(() => CountryRepositoryMapper.toCountry({ iso: 'es' })).toThrow(
      'Country iso must be an uppercase ISO 3166-1 alpha-2 code',
    );
  });
});
