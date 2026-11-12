export interface V1AdminLocalityResponseBody {
  id: string;
  countryIso: string;
  name: string;
  qualifier?: string;
  aliases: string[];
  timeZone: string;
}

export interface V1AdminLocalitiesListResponseBody {
  localities: V1AdminLocalityResponseBody[];
}
