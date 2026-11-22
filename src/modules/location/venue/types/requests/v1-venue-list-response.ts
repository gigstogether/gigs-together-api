import type { V1LocalityListItemResponseBody } from '../../../locality/types/requests/v1-locality-list-response';

export interface V1VenueListItemResponseBody {
  id: string;
  name: string;
}

export interface V1VenueListResponseBody {
  locality: V1LocalityListItemResponseBody;
  venues: V1VenueListItemResponseBody[];
}
