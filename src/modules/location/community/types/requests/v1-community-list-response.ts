export interface V1CommunityListItemResponseBody {
  id: string;
  countryIso: string;
  slug: string;
  nameTranslationKey: string;
  timeZone: string;
}

export interface V1CommunityListResponseBody {
  nameTranslationNamespace: 'community';
  communities: V1CommunityListItemResponseBody[];
}
