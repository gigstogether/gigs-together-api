import { VenueSchema } from './venue.schema';

describe('VenueSchema', () => {
  it('should store Venues in the venues collection', () => {
    expect(VenueSchema.get('collection')).toBe('venues');
  });

  it('should require the Venue catalog fields', () => {
    for (const fieldName of ['localityId', 'name', 'aliases', 'isActive']) {
      expect(VenueSchema.path(fieldName).options.required).toBe(true);
    }

    expect(VenueSchema.path('localityId').instance).toBe('ObjectId');
    expect(VenueSchema.path('address')).toBeUndefined();
    expect(VenueSchema.path('coordinates')).toBeUndefined();
  });

  it('should enforce a case-insensitive unique name within a Locality', () => {
    expect(VenueSchema.indexes()).toContainEqual([
      { localityId: 1, name: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2 },
      }),
    ]);
  });
});
