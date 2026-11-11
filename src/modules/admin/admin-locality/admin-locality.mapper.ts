import type {
  CreateLocalityParams,
  FindLocalitiesParams,
  UpdateLocalityParams,
} from '@modules/location/locality/locality.service';
import type { Locality } from '@modules/location/locality/types/locality.types';
import type {
  V1AdminLocalitiesGetQueryDto,
  V1AdminLocalityCreateBodyDto,
  V1AdminLocalityPatchBodyDto,
} from './types/requests/v1-admin-locality-request';
import type { V1AdminLocalityResponseBody } from './types/requests/v1-admin-locality-response';

export function mapV1AdminLocalitiesGetRequest(
  query: V1AdminLocalitiesGetQueryDto,
): FindLocalitiesParams {
  const params: FindLocalitiesParams = {};

  if (query.regionId !== undefined) {
    params.regionId = query.regionId;
  }
  if (query.search !== undefined) {
    params.search = query.search;
  }

  return params;
}

export function mapV1AdminLocalityCreateRequest(
  body: V1AdminLocalityCreateBodyDto,
): CreateLocalityParams {
  return {
    regionId: body.regionId,
    name: body.name,
    aliases: [...body.aliases],
    timeZone: body.timeZone,
  };
}

export function mapV1AdminLocalityUpdateRequest(
  id: string,
  body: V1AdminLocalityPatchBodyDto,
): UpdateLocalityParams {
  const params: UpdateLocalityParams = { id };

  if (body.name !== undefined) {
    params.name = body.name;
  }
  if (body.aliases !== undefined) {
    params.aliases = [...body.aliases];
  }
  if (body.timeZone !== undefined) {
    params.timeZone = body.timeZone;
  }

  return params;
}

export function mapV1AdminLocalityResponse(
  locality: Locality,
): V1AdminLocalityResponseBody {
  return {
    id: locality.id,
    regionId: locality.regionId,
    name: locality.name,
    aliases: [...locality.aliases],
    timeZone: locality.timeZone,
  };
}
