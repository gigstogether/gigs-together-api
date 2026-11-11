export interface V1AdminPlaceResponseBody {
  id: string;
  localityId: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface V1AdminPlacesListResponseBody {
  places: V1AdminPlaceResponseBody[];
}
