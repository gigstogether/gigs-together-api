import { PATH_METADATA } from '@nestjs/common/constants';
import { CountriesController } from './countries.controller';
import { CountryService } from './country.service';

describe('CountriesController', () => {
  it('should expose the countries collection as the root resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CountriesController)).toBe(
      'countries',
    );
  });

  it('should return the complete country reference catalog', () => {
    const controller = new CountriesController(new CountryService());
    const countries = controller.getCountriesV1();

    expect(countries).toHaveLength(249);
    expect(countries).toContainEqual({ iso: 'FR' });
  });
});
