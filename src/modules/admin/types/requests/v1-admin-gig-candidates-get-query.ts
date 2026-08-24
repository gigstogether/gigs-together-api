import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

import { GigCandidateStatus } from '../../../gig-candidate/types/gig-candidate-status.enum';
import {
  ADMIN_GIG_CANDIDATE_LIST_DEFAULT_LIMIT,
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../../../gig-candidate/gig-candidate-list-sort';

export const ADMIN_GIG_CANDIDATE_STATUS_QUERY_VALUES = [
  'pending',
  'reviewing',
  'approved',
  'rejected',
] as const;

export type AdminGigCandidateStatusQuery =
  (typeof ADMIN_GIG_CANDIDATE_STATUS_QUERY_VALUES)[number];

export function mapAdminGigCandidateStatusQuery(
  status: AdminGigCandidateStatusQuery,
): GigCandidateStatus {
  switch (status) {
    case 'pending':
      return GigCandidateStatus.Pending;
    case 'reviewing':
      return GigCandidateStatus.Reviewing;
    case 'approved':
      return GigCandidateStatus.Approved;
    case 'rejected':
      return GigCandidateStatus.Rejected;
  }
}

const ADMIN_GIG_CANDIDATE_SORT_BY_VALUES = [
  AdminGigCandidateListSortBy.CreatedAt,
  AdminGigCandidateListSortBy.EventDate,
] as const;

const ADMIN_GIG_CANDIDATE_SORT_ORDER_VALUES = [
  AdminGigCandidateListSortOrder.Asc,
  AdminGigCandidateListSortOrder.Desc,
] as const;

export class V1AdminGigCandidatesGetQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ADMIN_GIG_CANDIDATE_STATUS_QUERY_VALUES)
  status!: AdminGigCandidateStatusQuery;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsIn(ADMIN_GIG_CANDIDATE_SORT_BY_VALUES)
  sortBy?: AdminGigCandidateListSortBy;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ADMIN_GIG_CANDIDATE_SORT_ORDER_VALUES)
  sortOrder?: AdminGigCandidateListSortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = ADMIN_GIG_CANDIDATE_LIST_DEFAULT_LIMIT;
}
