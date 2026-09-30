import { PATH_METADATA } from '@nestjs/common/constants';

import { TranslationController } from './translation.controller';

describe('TranslationController', () => {
  it('should expose the translations collection as the root resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TranslationController)).toBe(
      'translations',
    );
  });
});
