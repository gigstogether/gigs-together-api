export interface V1LocalityListItemResponseBody {
  id: string;
  countryIso: string;
  name: string;
  qualifier?: string;
  timeZone: string;
}

export interface V1LocalityListResponseBody {
  localities: V1LocalityListItemResponseBody[];
}
