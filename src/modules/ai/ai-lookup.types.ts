export interface AiGigLookupParams {
  name: string;
  location: string;
}

export interface AiGigLookupLocationHint {
  locality: string;
  country: string;
  venue: string;
}

export interface AiGigLookupResult {
  title: string;
  date: string;
  endDate?: string;
  ticketsUrl: string;
  posterUrl?: string;
  locationHint: AiGigLookupLocationHint;
}
