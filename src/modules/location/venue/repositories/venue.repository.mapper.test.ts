import { Types } from 'mongoose';
import { VenueRepositoryMapper } from './venue.repository.mapper';
import type { VenueLeanDocument } from './venue.repository.mapper';

const VENUE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';

function createVenueDocument(): VenueLeanDocument {
  return {
    _id: new Types.ObjectId(VENUE_ID),
    localityId: new Types.ObjectId(LOCALITY_ID),
    name: 'Sala Apolo',
    aliases: ['Apolo'],
    isActive: true,
  };
}

describe('VenueRepositoryMapper', () => {
  it('should map a Locality id to its stored ObjectId', () => {
    expect(VenueRepositoryMapper.toStoredLocalityId(LOCALITY_ID)).toEqual(
      new Types.ObjectId(LOCALITY_ID),
    );
  });

  it('should reject an invalid Locality id before persistence', () => {
    expect(() => VenueRepositoryMapper.toStoredLocalityId('invalid')).toThrow(
      'Locality id must be a valid ObjectId',
    );
  });

  it('should map a stored Venue to the domain model', () => {
    expect(VenueRepositoryMapper.toVenue(createVenueDocument())).toEqual({
      id: VENUE_ID,
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });

  it('should reject an invalid Locality reference', () => {
    const doc = createVenueDocument();
    doc.localityId = 'invalid';

    expect(() => VenueRepositoryMapper.toVenue(doc)).toThrow(
      'Venue localityId must be an ObjectId',
    );
  });

  it('should reject duplicate aliases', () => {
    const doc = createVenueDocument();
    doc.aliases = ['Apolo', 'APOLO'];

    expect(() => VenueRepositoryMapper.toVenue(doc)).toThrow(
      'Venue aliases must be unique non-empty names',
    );
  });
});
