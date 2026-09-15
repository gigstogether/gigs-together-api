import type { V1GetGigsResponseBodyGig } from '../gig.types';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { parseYyyyMmDdToMs } from './v1-gig-date-range.shared';

export class V1GigAroundGetRequestQuery {
  /**
   * Anchor date (inclusive for the "after" chunk), format: "YYYY-MM-DD" (local).
   */
  @Transform(({ value }) => parseYyyyMmDdToMs(value, 'from'))
  @IsNumber()
  anchor!: number;

  /**
   * How many gigs to load before the anchor date (strictly before).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  beforeLimit: number = 100;

  /**
   * How many gigs to load starting from the anchor date (inclusive).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  afterLimit: number = 100;

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

export interface V1GigAroundGetResponseBody {
  before: V1GetGigsResponseBodyGig[];
  after: V1GetGigsResponseBodyGig[];
  prevCursor?: string;
  nextCursor?: string;
}
