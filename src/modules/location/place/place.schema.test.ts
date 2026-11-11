import { PlaceSchema } from './place.schema';

describe('PlaceSchema', () => {
  it('should require the Place catalog fields', () => {
    for (const fieldName of ['localityId', 'name', 'aliases', 'isActive']) {
      expect(PlaceSchema.path(fieldName).options.required).toBe(true);
    }

    expect(PlaceSchema.path('localityId').instance).toBe('ObjectId');
    expect(PlaceSchema.path('address')).toBeUndefined();
    expect(PlaceSchema.path('coordinates')).toBeUndefined();
  });

  it('should enforce a case-insensitive unique name within a Locality', () => {
    expect(PlaceSchema.indexes()).toContainEqual([
      { localityId: 1, name: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2 },
      }),
    ]);
  });
});
