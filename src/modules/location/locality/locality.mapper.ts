import type { Locality } from './types/locality.types';
import type { V1LocalityListItemResponseBody } from './types/requests/v1-locality-list-response';

export function mapV1LocalityListItemResponse(
  locality: Locality,
): V1LocalityListItemResponseBody {
  const response: V1LocalityListItemResponseBody = {
    id: locality.id,
    countryIso: locality.countryIso,
    name: locality.name,
    timeZone: locality.timeZone,
  };

  if (locality.qualifier !== undefined) {
    response.qualifier = locality.qualifier;
  }

  return response;
}
