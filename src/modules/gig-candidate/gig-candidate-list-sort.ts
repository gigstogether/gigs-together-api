export enum AdminGigCandidateListSortBy {
  CreatedAt = 'createdAt',
  EventDate = 'eventDate',
}

export enum AdminGigCandidateListSortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export const ADMIN_GIG_CANDIDATE_LIST_DEFAULT_LIMIT = 100;
export const ADMIN_GIG_CANDIDATE_LIST_DEFAULT_SORT_ORDER =
  AdminGigCandidateListSortOrder.Desc;
