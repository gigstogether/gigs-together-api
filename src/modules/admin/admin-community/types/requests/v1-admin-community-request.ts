import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO31661Alpha2,
  IsMongoId,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  COMMUNITY_NAME_TRANSLATION_KEY_MAX_LENGTH,
  COMMUNITY_SLUG_MAX_LENGTH,
} from '@modules/community/community.validators';

export class V1AdminCommunityIdParamsDto {
  @IsMongoId()
  id!: string;
}

export class V1AdminCommunityCreateBodyDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryIso!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(COMMUNITY_SLUG_MAX_LENGTH)
  slug!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(COMMUNITY_NAME_TRANSLATION_KEY_MAX_LENGTH)
  nameTranslationKey!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timeZone!: string;

  @IsBoolean()
  isActive!: boolean;
}

export class V1AdminCommunityPatchBodyDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryIso?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(COMMUNITY_SLUG_MAX_LENGTH)
  slug?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(COMMUNITY_NAME_TRANSLATION_KEY_MAX_LENGTH)
  nameTranslationKey?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timeZone?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
