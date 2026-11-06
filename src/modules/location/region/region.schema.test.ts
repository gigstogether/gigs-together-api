import { RegionSchema } from './region.schema';

describe('RegionSchema', () => {
  it('should require all Region fields without an active state', () => {
    for (const fieldName of ['countryIso', 'name', 'aliases']) {
      expect(RegionSchema.path(fieldName).options.required).toBe(true);
    }

    expect(RegionSchema.path('isActive')).toBeUndefined();
  });

  it('should enforce a case-insensitive unique name within a country', () => {
    expect(RegionSchema.indexes()).toContainEqual([
      { countryIso: 1, name: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2 },
      }),
    ]);
  });
});
