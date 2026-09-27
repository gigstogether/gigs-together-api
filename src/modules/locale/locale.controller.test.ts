import { PATH_METADATA } from '@nestjs/common/constants';

import { LocaleController } from './locale.controller';

describe('LocaleController', () => {
  it('should expose the plural locales resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LocaleController)).toBe(
      'locales',
    );
  });
});
