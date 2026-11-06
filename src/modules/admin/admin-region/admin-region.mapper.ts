import type {
  CreateRegionParams,
  FindRegionsParams,
  UpdateRegionParams,
} from '@modules/location/region/region.service';
import type { Region } from '@modules/location/region/types/region.types';
import type {
  V1AdminRegionCreateBodyDto,
  V1AdminRegionPatchBodyDto,
  V1AdminRegionsGetQueryDto,
} from './types/requests/v1-admin-region-request';
import type { V1AdminRegionResponseBody } from './types/requests/v1-admin-region-response';

export function mapV1AdminRegionsGetRequest(
  query: V1AdminRegionsGetQueryDto,
): FindRegionsParams {
  const params: FindRegionsParams = {};

  if (query.countryIso !== undefined) {
    params.countryIso = query.countryIso;
  }
  if (query.search !== undefined) {
    params.search = query.search;
  }

  return params;
}

export function mapV1AdminRegionCreateRequest(
  body: V1AdminRegionCreateBodyDto,
): CreateRegionParams {
  return {
    countryIso: body.countryIso,
    name: body.name,
    aliases: [...body.aliases],
  };
}

export function mapV1AdminRegionUpdateRequest(
  id: string,
  body: V1AdminRegionPatchBodyDto,
): UpdateRegionParams {
  const params: UpdateRegionParams = { id };

  if (body.name !== undefined) {
    params.name = body.name;
  }
  if (body.aliases !== undefined) {
    params.aliases = [...body.aliases];
  }

  return params;
}

export function mapV1AdminRegionResponse(
  region: Region,
): V1AdminRegionResponseBody {
  return {
    id: region.id,
    countryIso: region.countryIso,
    name: region.name,
    aliases: [...region.aliases],
  };
}
