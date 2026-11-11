export interface V1AdminLocalityResponseBody {
  id: string;
  regionId: string;
  name: string;
  aliases: string[];
  timeZone: string;
}

export interface V1AdminLocalitiesListResponseBody {
  localities: V1AdminLocalityResponseBody[];
}
