import { validate } from 'class-validator';

import { V1AdminTranslationUpsertBodyDto } from './v1-admin-translation-upsert-body';

describe('V1AdminTranslationUpsertBodyDto', () => {
  it('should accept valid translation upsert body', async () => {
    const dto = Object.assign(new V1AdminTranslationUpsertBodyDto(), {
      namespace: 'about',
      locale: 'en',
      key: 'title',
      value: 'About',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('should reject invalid namespace in upsert body', async () => {
    const dto = Object.assign(new V1AdminTranslationUpsertBodyDto(), {
      namespace: '$invalid',
      locale: 'en',
      key: 'title',
      value: 'About',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'namespace')).toBe(true);
  });

  it('should reject invalid key in upsert body', async () => {
    const dto = Object.assign(new V1AdminTranslationUpsertBodyDto(), {
      namespace: 'about',
      locale: 'en',
      key: 'invalid_key',
      value: 'About',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'key')).toBe(true);
  });
});
