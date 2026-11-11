import type { Locality } from '@modules/location/locality/types/locality.types';
import {
  mapV1AdminLocalitiesGetRequest,
  mapV1AdminLocalityCreateRequest,
  mapV1AdminLocalityResponse,
  mapV1AdminLocalityUpdateRequest,
} from './admin-locality.mapper';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const LOCALITY: Locality = {
  id: LOCALITY_ID,
  regionId: REGION_ID,
  name: 'Barcelona',
  aliases: ['Barna', 'BCN'],
  timeZone: 'Europe/Madrid',
};

describe('mapV1AdminLocalitiesGetRequest', () => {
  it('should map defined Locality filters', () => {
    expect(
      mapV1AdminLocalitiesGetRequest({
        regionId: REGION_ID,
        search: 'bar',
      }),
    ).toEqual({ regionId: REGION_ID, search: 'bar' });
  });

  it('should omit absent Locality filters', () => {
    expect(mapV1AdminLocalitiesGetRequest({})).toEqual({});
  });
});

describe('mapV1AdminLocalityCreateRequest', () => {
  it('should map a Locality create request', () => {
    expect(
      mapV1AdminLocalityCreateRequest({
        regionId: REGION_ID,
        name: 'Barcelona',
        aliases: ['Barna', 'BCN'],
        timeZone: 'Europe/Madrid',
      }),
    ).toEqual({
      regionId: REGION_ID,
      name: 'Barcelona',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });
});

describe('mapV1AdminLocalityUpdateRequest', () => {
  it('should map only defined Locality update fields', () => {
    expect(
      mapV1AdminLocalityUpdateRequest(LOCALITY_ID, {
        timeZone: 'Europe/Paris',
      }),
    ).toEqual({ id: LOCALITY_ID, timeZone: 'Europe/Paris' });
  });
});

describe('mapV1AdminLocalityResponse', () => {
  it('should map a Locality response', () => {
    expect(mapV1AdminLocalityResponse(LOCALITY)).toEqual(LOCALITY);
  });
});
