export interface V1AdminCommunityResponseBody {
  id: string;
  countryIso: string;
  slug: string;
  nameTranslationKey: string;
  timeZone: string;
  isActive: boolean;
}

export interface V1AdminCommunitiesListResponseBody {
  communities: V1AdminCommunityResponseBody[];
}
