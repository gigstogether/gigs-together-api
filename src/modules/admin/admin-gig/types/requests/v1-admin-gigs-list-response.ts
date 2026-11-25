import type { GigSourceForAdminView } from '@modules/gig/types/gig.types';

/** Admin gigs list / preview card (GET v1/admin/gigs). */
export interface V1AdminGigListItem {
  publicId: string;
  communityIds: string[];
  venueIds: string[];
  locality: V1AdminGigLocality;
  venues: V1AdminGigVenue[];
  title: string;
  isVisible: boolean;
  version: number;
  source: GigSourceForAdminView;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  posterUrl?: string;
  ticketsUrl?: string;
  mainPostUrl?: string;
  mainPostDate?: number;
  moderationPostUrl?: string;
  moderationPostDate?: number;
}

export interface V1AdminGigLocality {
  id: string;
  countryIso: string;
  name: string;
  qualifier?: string;
}

export interface V1AdminGigVenue {
  id: string;
  name: string;
}

export interface V1AdminGigResponseBody extends V1AdminGigListItem {
  ticketsUrl: string;
}

export interface V1AdminGigsListResponseBody {
  gigs: V1AdminGigListItem[];
}
