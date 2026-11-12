import { LocalitySchema } from './locality.schema';

describe('LocalitySchema', () => {
  it('should require Country, name, aliases, and time zone', () => {
    for (const fieldName of ['countryIso', 'name', 'aliases', 'timeZone']) {
      expect(LocalitySchema.path(fieldName).options.required).toBe(true);
    }

    expect(LocalitySchema.path('qualifier').options.required).toBe(false);
    expect(LocalitySchema.path('isActive')).toBeUndefined();
  });

  it('should enforce a case-insensitive unique identity within a Country', () => {
    expect(LocalitySchema.indexes()).toContainEqual([
      { countryIso: 1, name: 1, qualifier: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2 },
      }),
    ]);
  });
});
