export interface V1AdminVenueResponseBody {
  id: string;
  localityId: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface V1AdminVenuesListResponseBody {
  venues: V1AdminVenueResponseBody[];
}
