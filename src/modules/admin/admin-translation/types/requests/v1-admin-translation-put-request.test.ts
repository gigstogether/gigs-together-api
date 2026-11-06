import { validate } from 'class-validator';

import {
  V1AdminTranslationPutBodyDto,
  V1AdminTranslationPutParamsDto,
} from './v1-admin-translation-put-request';

describe('V1AdminTranslationPutParamsDto', () => {
  it('should accept a valid translation resource identity', async () => {
    const dto = Object.assign(new V1AdminTranslationPutParamsDto(), {
      namespace: 'about',
      locale: 'en',
      key: 'title',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('should reject an invalid translation resource identity', async () => {
    const dto = Object.assign(new V1AdminTranslationPutParamsDto(), {
      namespace: '$invalid',
      locale: 'en',
      key: 'invalid_key',
    });

    const errors = await validate(dto);

    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['namespace', 'key']),
    );
  });
});

describe('V1AdminTranslationPutBodyDto', () => {
  it('should accept valid replacement fields', async () => {
    const dto = Object.assign(new V1AdminTranslationPutBodyDto(), {
      value: 'About',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('should reject an incomplete replacement body', async () => {
    const dto = Object.assign(new V1AdminTranslationPutBodyDto(), {
      value: 'About',
    });

    const errors = await validate(dto);

    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['format', 'kind', 'isActive']),
    );
  });
});
