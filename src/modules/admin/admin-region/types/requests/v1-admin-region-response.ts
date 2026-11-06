export interface V1AdminRegionResponseBody {
  id: string;
  countryIso: string;
  name: string;
  aliases: string[];
}

export interface V1AdminRegionsListResponseBody {
  regions: V1AdminRegionResponseBody[];
}
