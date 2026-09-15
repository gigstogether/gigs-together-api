import type { GigSourceForAdminView } from '../../../gig/types/gig.types';

/** Admin gigs list / preview card (GET v1/admin/gigs). */
export interface V1AdminGigListItem {
  readonly publicId: string;
  readonly title: string;
  readonly isVisible: boolean;
  readonly version: number;
  readonly source: GigSourceForAdminView;
  readonly date: string;
  readonly endDate?: string;
  readonly city: string;
  readonly country: string;
  readonly venue: string;
  readonly posterUrl?: string;
  readonly ticketsUrl?: string;
  readonly publishPostUrl?: string;
  readonly publishPostDate?: number;
  readonly moderationPostUrl?: string;
  readonly moderationPostDate?: number;
}

export interface V1AdminGigsListResponseBody {
  readonly gigs: readonly V1AdminGigListItem[];
}
