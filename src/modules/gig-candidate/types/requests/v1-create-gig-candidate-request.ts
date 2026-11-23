export interface V1CreateGigCandidateRequestBodyGig {
  communityId: string;
  localityId: string;
  venueIds?: string[];
  title: string;
  date: string;
  endDate?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

export interface V1CreateGigCandidateRequestBody {
  gig: V1CreateGigCandidateRequestBodyGig;
}
