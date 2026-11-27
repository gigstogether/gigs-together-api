export interface CommunityData {
  countryIso: string;
  slug: string;
  nameTranslationKey: string;
  timeZone: string;
  isActive: boolean;
}

export interface Community extends CommunityData {
  id: string;
}
