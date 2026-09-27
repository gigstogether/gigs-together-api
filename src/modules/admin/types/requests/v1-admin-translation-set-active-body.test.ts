import { validate } from 'class-validator';
import {
  V1AdminTranslationSetActiveBodyDto,
  V1AdminTranslationSetActiveParamsDto,
} from './v1-admin-translation-set-active-body';

describe('V1AdminTranslationSetActiveParamsDto', () => {
  it('should accept a valid translation id', async () => {
    const dto = Object.assign(new V1AdminTranslationSetActiveParamsDto(), {
      id: '64f1a2b3c4d5e6f7a8b9c0d1',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('should reject an invalid translation id', async () => {
    const dto = Object.assign(new V1AdminTranslationSetActiveParamsDto(), {
      id: 'not-an-object-id',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints?.matches).toBe('id has invalid format');
  });
});

describe('V1AdminTranslationSetActiveBodyDto', () => {
  it('should accept a boolean active flag', async () => {
    const dto = Object.assign(new V1AdminTranslationSetActiveBodyDto(), {
      isActive: false,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('should reject a non-boolean active flag', async () => {
    const dto = Object.assign(new V1AdminTranslationSetActiveBodyDto(), {
      isActive: 'false',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('isActive');
  });
});
