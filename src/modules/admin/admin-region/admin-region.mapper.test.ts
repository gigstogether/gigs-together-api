import type { Region } from '@modules/location/region/types/region.types';
import {
  mapV1AdminRegionCreateRequest,
  mapV1AdminRegionResponse,
  mapV1AdminRegionsGetRequest,
  mapV1AdminRegionUpdateRequest,
} from './admin-region.mapper';

const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const REGION: Region = {
  id: REGION_ID,
  countryIso: 'ES',
  name: 'Catalonia',
  aliases: ['Catalunya', 'Cataluña'],
};

describe('mapV1AdminRegionsGetRequest', () => {
  it('should map defined Region filters', () => {
    expect(
      mapV1AdminRegionsGetRequest({ countryIso: 'ES', search: 'cat' }),
    ).toEqual({
      countryIso: 'ES',
      search: 'cat',
    });
  });

  it('should omit absent Region filters', () => {
    expect(mapV1AdminRegionsGetRequest({})).toEqual({});
  });
});

describe('mapV1AdminRegionCreateRequest', () => {
  it('should map a Region create request', () => {
    expect(
      mapV1AdminRegionCreateRequest({
        countryIso: 'ES',
        name: 'Catalonia',
        aliases: ['Catalunya', 'Cataluña'],
      }),
    ).toEqual({
      countryIso: 'ES',
      name: 'Catalonia',
      aliases: ['Catalunya', 'Cataluña'],
    });
  });
});

describe('mapV1AdminRegionUpdateRequest', () => {
  it('should map only defined Region update fields', () => {
    expect(
      mapV1AdminRegionUpdateRequest(REGION_ID, {
        aliases: ['Catalunya'],
      }),
    ).toEqual({
      id: REGION_ID,
      aliases: ['Catalunya'],
    });
  });
});

describe('mapV1AdminRegionResponse', () => {
  it('should map a Region response', () => {
    expect(mapV1AdminRegionResponse(REGION)).toEqual({
      id: REGION_ID,
      countryIso: 'ES',
      name: 'Catalonia',
      aliases: ['Catalunya', 'Cataluña'],
    });
  });
});
