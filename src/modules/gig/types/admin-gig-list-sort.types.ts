export enum AdminGigListSortBy {
  CreatedAt = 'createdAt',
  EventDate = 'eventDate',
}

export enum AdminGigListSortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export const ADMIN_GIG_LIST_SORT_BY_VALUES = [
  AdminGigListSortBy.CreatedAt,
  AdminGigListSortBy.EventDate,
] as const;

export const ADMIN_GIG_LIST_SORT_ORDER_VALUES = [
  AdminGigListSortOrder.Asc,
  AdminGigListSortOrder.Desc,
] as const;

export const ADMIN_GIG_LIST_DEFAULT_SORT_ORDER = AdminGigListSortOrder.Desc;

export const ADMIN_GIG_LIST_DEFAULT_LIMIT = 100;
