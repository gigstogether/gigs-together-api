import type {
  CreatePlaceParams,
  FindPlacesParams,
  UpdatePlaceParams,
} from '@modules/location/place/place.service';
import type { Place } from '@modules/location/place/types/place.types';
import type {
  V1AdminPlaceCreateBodyDto,
  V1AdminPlacePatchBodyDto,
  V1AdminPlacesGetQueryDto,
} from './types/requests/v1-admin-place-request';
import type { V1AdminPlaceResponseBody } from './types/requests/v1-admin-place-response';

export function mapV1AdminPlacesGetRequest(
  query: V1AdminPlacesGetQueryDto,
): FindPlacesParams {
  const params: FindPlacesParams = {};

  if (query.localityId !== undefined) {
    params.localityId = query.localityId;
  }
  if (query.search !== undefined) {
    params.search = query.search;
  }
  if (query.isActive !== undefined) {
    params.isActive = query.isActive;
  }

  return params;
}

export function mapV1AdminPlaceCreateRequest(
  body: V1AdminPlaceCreateBodyDto,
): CreatePlaceParams {
  return {
    localityId: body.localityId,
    name: body.name,
    aliases: [...body.aliases],
    isActive: body.isActive,
  };
}

export function mapV1AdminPlaceUpdateRequest(
  id: string,
  body: V1AdminPlacePatchBodyDto,
): UpdatePlaceParams {
  const params: UpdatePlaceParams = { id };

  if (body.name !== undefined) {
    params.name = body.name;
  }
  if (body.aliases !== undefined) {
    params.aliases = [...body.aliases];
  }
  if (body.isActive !== undefined) {
    params.isActive = body.isActive;
  }

  return params;
}

export function mapV1AdminPlaceResponse(
  place: Place,
): V1AdminPlaceResponseBody {
  return {
    id: place.id,
    localityId: place.localityId,
    name: place.name,
    aliases: [...place.aliases],
    isActive: place.isActive,
  };
}
