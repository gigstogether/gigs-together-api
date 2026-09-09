import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { parseYyyyMmDdToMs, startOfTodayMs } from './v1-gig-date-range.shared';

export class V1GigDatesGetRequestQuery {
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

export interface V1GigDatesGetResponseBody {
  /**
   * Unique gig dates, sorted ascending.
   *
   * Values are the raw stored "date" field (ms since epoch),
   * stringified for transport stability.
   */
  dates: string[];
}
