import type { Status } from '../../../gig/types/status.enum';

interface V1AdminGigSuggestedBy {
  readonly userId: string;
  readonly name?: string;
  readonly username?: string;
}

/** Admin gigs list / preview card (GET v1/admin/gigs). */
export interface V1AdminGigListItem {
  readonly publicId: string;
  readonly title: string;
  readonly status: Status;
  readonly date: string;
  readonly endDate?: string;
  readonly city: string;
  readonly country: string;
  readonly venue: string;
  readonly posterUrl?: string;
  readonly suggestedBy: V1AdminGigSuggestedBy;
  readonly ticketsUrl?: string;
  readonly publishPostUrl?: string;
  readonly publishPostDate?: number;
  readonly moderationPostDate?: number;
}

export interface V1AdminGigsListResponseBody {
  readonly gigs: readonly V1AdminGigListItem[];
}
