export const ADMIN_GIG_LIST_SORT_BY_VALUES = ['post_date'] as const;

export type AdminGigListSortBy = (typeof ADMIN_GIG_LIST_SORT_BY_VALUES)[number];

export const ADMIN_GIG_LIST_SORT_ORDER_VALUES = ['asc', 'desc'] as const;

export type AdminGigListSortOrder =
  (typeof ADMIN_GIG_LIST_SORT_ORDER_VALUES)[number];

export const ADMIN_GIG_LIST_DEFAULT_SORT_BY: AdminGigListSortBy = 'post_date';

export const ADMIN_GIG_LIST_DEFAULT_SORT_ORDER: AdminGigListSortOrder = 'desc';
