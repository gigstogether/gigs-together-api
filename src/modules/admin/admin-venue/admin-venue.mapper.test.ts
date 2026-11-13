import type { Venue } from '@modules/location/venue/types/venue.types';
import {
  mapV1AdminVenueCreateRequest,
  mapV1AdminVenueResponse,
  mapV1AdminVenuesGetRequest,
  mapV1AdminVenueUpdateRequest,
} from './admin-venue.mapper';

const VENUE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const VENUE: Venue = {
  id: VENUE_ID,
  localityId: LOCALITY_ID,
  name: 'Sala Apolo',
  aliases: ['Apolo'],
  isActive: true,
};

describe('mapV1AdminVenuesGetRequest', () => {
  it('should map defined Venue filters', () => {
    expect(
      mapV1AdminVenuesGetRequest({
        localityId: LOCALITY_ID,
        search: 'apolo',
        isActive: true,
      }),
    ).toEqual({
      localityId: LOCALITY_ID,
      search: 'apolo',
      isActive: true,
    });
  });

  it('should omit absent Venue filters', () => {
    expect(mapV1AdminVenuesGetRequest({})).toEqual({});
  });
});

describe('mapV1AdminVenueCreateRequest', () => {
  it('should map a Venue create request', () => {
    expect(
      mapV1AdminVenueCreateRequest({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: ['Apolo'],
        isActive: true,
      }),
    ).toEqual({
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });
});

describe('mapV1AdminVenueUpdateRequest', () => {
  it('should map only defined Venue update fields', () => {
    expect(mapV1AdminVenueUpdateRequest(VENUE_ID, { isActive: false })).toEqual(
      { id: VENUE_ID, isActive: false },
    );
  });
});

describe('mapV1AdminVenueResponse', () => {
  it('should map a Venue response', () => {
    expect(mapV1AdminVenueResponse(VENUE)).toEqual(VENUE);
  });
});
