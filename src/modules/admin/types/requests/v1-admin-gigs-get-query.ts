import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import {
  ADMIN_GIG_LIST_DEFAULT_LIMIT,
  ADMIN_GIG_LIST_SORT_BY_VALUES,
  ADMIN_GIG_LIST_SORT_ORDER_VALUES,
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from '../../../gig/types/admin-gig-list-sort.types';

export class V1AdminGigsGetQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsIn(ADMIN_GIG_LIST_SORT_BY_VALUES)
  sortBy?: AdminGigListSortBy;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ADMIN_GIG_LIST_SORT_ORDER_VALUES)
  sortOrder?: AdminGigListSortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = ADMIN_GIG_LIST_DEFAULT_LIMIT;
}
