import { LocalitySchema } from './locality.schema';

describe('LocalitySchema', () => {
  it('should require all Locality fields without country or active state', () => {
    for (const fieldName of ['regionId', 'name', 'aliases', 'timeZone']) {
      expect(LocalitySchema.path(fieldName).options.required).toBe(true);
    }

    expect(LocalitySchema.path('countryIso')).toBeUndefined();
    expect(LocalitySchema.path('isActive')).toBeUndefined();
    expect(LocalitySchema.path('regionId').instance).toBe('ObjectId');
  });

  it('should enforce a case-insensitive unique name within a Region', () => {
    expect(LocalitySchema.indexes()).toContainEqual([
      { regionId: 1, name: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2 },
      }),
    ]);
  });
});
