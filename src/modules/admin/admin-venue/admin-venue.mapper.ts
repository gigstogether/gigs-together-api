import type {
  CreateVenueParams,
  FindVenuesParams,
  UpdateVenueParams,
} from '@modules/location/venue/venue.service';
import type { Venue } from '@modules/location/venue/types/venue.types';
import type {
  V1AdminVenueCreateBodyDto,
  V1AdminVenuePatchBodyDto,
  V1AdminVenuesGetQueryDto,
} from './types/requests/v1-admin-venue-request';
import type { V1AdminVenueResponseBody } from './types/requests/v1-admin-venue-response';

export function mapV1AdminVenuesGetRequest(
  query: V1AdminVenuesGetQueryDto,
): FindVenuesParams {
  const params: FindVenuesParams = {};

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

export function mapV1AdminVenueCreateRequest(
  body: V1AdminVenueCreateBodyDto,
): CreateVenueParams {
  return {
    localityId: body.localityId,
    name: body.name,
    aliases: [...body.aliases],
    isActive: body.isActive,
  };
}

export function mapV1AdminVenueUpdateRequest(
  id: string,
  body: V1AdminVenuePatchBodyDto,
): UpdateVenueParams {
  const params: UpdateVenueParams = { id };

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

export function mapV1AdminVenueResponse(
  venue: Venue,
): V1AdminVenueResponseBody {
  return {
    id: venue.id,
    localityId: venue.localityId,
    name: venue.name,
    aliases: [...venue.aliases],
    isActive: venue.isActive,
  };
}
