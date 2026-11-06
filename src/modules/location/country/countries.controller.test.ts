import { PATH_METADATA } from '@nestjs/common/constants';

import { CountriesController } from './countries.controller';

describe('CountriesController', () => {
  it('should expose the countries collection as the root resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CountriesController)).toBe(
      'countries',
    );
  });
});
