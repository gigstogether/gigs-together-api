import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import {
  ADMIN_GIG_LIST_DEFAULT_SORT_BY,
  ADMIN_GIG_LIST_DEFAULT_SORT_ORDER,
  ADMIN_GIG_LIST_SORT_BY_VALUES,
  ADMIN_GIG_LIST_SORT_ORDER_VALUES,
} from '../../../gig/types/admin-gig-list-sort.types';
import type {
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from '../../../gig/types/admin-gig-list-sort.types';

export const ADMIN_GIG_LIST_STATUS_QUERY_VALUES = [
  'pending',
  'published',
  'rejected',
] as const;

export type AdminGigListStatusQuery =
  (typeof ADMIN_GIG_LIST_STATUS_QUERY_VALUES)[number];

export class V1AdminGigsGetQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ADMIN_GIG_LIST_STATUS_QUERY_VALUES)
  status!: AdminGigListStatusQuery;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ADMIN_GIG_LIST_SORT_BY_VALUES)
  sortBy?: AdminGigListSortBy = ADMIN_GIG_LIST_DEFAULT_SORT_BY;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ADMIN_GIG_LIST_SORT_ORDER_VALUES)
  sortOrder?: AdminGigListSortOrder = ADMIN_GIG_LIST_DEFAULT_SORT_ORDER;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;
}
