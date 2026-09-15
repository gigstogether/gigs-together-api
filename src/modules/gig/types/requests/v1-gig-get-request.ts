import type { V1GetGigsResponseBodyGig } from '../gig.types';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import { parseYyyyMmDdToMs, startOfTodayMs } from './v1-gig-date-range.shared';

export class V1GigGetRequestQuery {
  /**
   * Pagination direction.
   * - next (default): results strictly after cursor (ascending)
   * - prev: results strictly before cursor (descending internally, returned ascending)
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['next', 'prev'])
  direction?: 'next' | 'prev';

  /**
   * Cursor pagination.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 100;

  /**
   * Date range bounds (inclusive), format: "YYYY-MM-DD" (local).
   */
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? startOfTodayMs()
      : parseYyyyMmDdToMs(value, 'from'),
  )
  @IsNumber()
  from: number = startOfTodayMs();

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : parseYyyyMmDdToMs(value, 'to'),
  )
  @IsNumber()
  to?: number;

  /**
   * Required location filter (exact match): country + city.
   *
   * IMPORTANT:
   * - `country` is ISO 3166-1 alpha-2 (uppercase), e.g. "ES".
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  city!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  country!: string;
}

export interface V1GetGigsResponseBody {
  gigs: V1GetGigsResponseBodyGig[];
  prevCursor?: string;
  nextCursor?: string;
}
