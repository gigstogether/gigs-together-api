import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class V1GigByPublicIdGetRequestParams {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/)
  publicId!: string;
}

export interface V1GigByPublicIdGetInput {
  publicId: string;
}

/**
 * Anchor calendar date for a visible Gig (deep link / hash → scroll target).
 * `publicId` is only in `GET .../date/:publicId`; not repeated in the body.
 */
export interface V1GigByPublicIdGetResponseBody {
  date: string;
}
