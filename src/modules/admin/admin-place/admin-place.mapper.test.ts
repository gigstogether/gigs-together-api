import type { Place } from '@modules/location/place/types/place.types';
import {
  mapV1AdminPlaceCreateRequest,
  mapV1AdminPlaceResponse,
  mapV1AdminPlacesGetRequest,
  mapV1AdminPlaceUpdateRequest,
} from './admin-place.mapper';

const PLACE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const PLACE: Place = {
  id: PLACE_ID,
  localityId: LOCALITY_ID,
  name: 'Sala Apolo',
  aliases: ['Apolo'],
  isActive: true,
};

describe('mapV1AdminPlacesGetRequest', () => {
  it('should map defined Place filters', () => {
    expect(
      mapV1AdminPlacesGetRequest({
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

  it('should omit absent Place filters', () => {
    expect(mapV1AdminPlacesGetRequest({})).toEqual({});
  });
});

describe('mapV1AdminPlaceCreateRequest', () => {
  it('should map a Place create request', () => {
    expect(
      mapV1AdminPlaceCreateRequest({
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

describe('mapV1AdminPlaceUpdateRequest', () => {
  it('should map only defined Place update fields', () => {
    expect(mapV1AdminPlaceUpdateRequest(PLACE_ID, { isActive: false })).toEqual(
      { id: PLACE_ID, isActive: false },
    );
  });
});

describe('mapV1AdminPlaceResponse', () => {
  it('should map a Place response', () => {
    expect(mapV1AdminPlaceResponse(PLACE)).toEqual(PLACE);
  });
});
