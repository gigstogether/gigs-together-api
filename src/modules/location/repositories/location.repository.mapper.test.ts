import { LocationRepositoryMapper } from './location.repository.mapper';

describe('LocationRepositoryMapper', () => {
  it('should map a stored country to the domain model', () => {
    expect(LocationRepositoryMapper.toCountry({ iso: 'ES' })).toEqual({
      iso: 'ES',
    });
  });

  it('should reject an invalid stored country iso', () => {
    expect(() => LocationRepositoryMapper.toCountry({ iso: 'es' })).toThrow(
      'Country iso must be an uppercase ISO 3166-1 alpha-2 code',
    );
  });
});
