import { CommunitySchema } from './community.schema';

describe('CommunitySchema', () => {
  it('should require explicit Community fields without defaults', () => {
    const fieldNames = [
      'countryIso',
      'slug',
      'nameTranslationKey',
      'timeZone',
      'isActive',
    ];

    for (const fieldName of fieldNames) {
      const options = CommunitySchema.path(fieldName).options;
      expect(options.required).toBe(true);
      expect(options.default).toBeUndefined();
    }
  });

  it('should enforce unique routes and support active catalog queries', () => {
    expect(CommunitySchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ countryIso: 1, slug: 1 }, expect.objectContaining({ unique: true })],
        [{ isActive: 1, countryIso: 1, slug: 1 }, expect.any(Object)],
      ]),
    );
  });
});
