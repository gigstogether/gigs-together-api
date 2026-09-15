export interface V1CreateGigCandidateRequestBodyGig {
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

export interface V1CreateGigCandidateRequestBody {
  gig: V1CreateGigCandidateRequestBodyGig;
}
