import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO31661Alpha2,
  IsMongoId,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  LOCALITY_ALIAS_MAX_COUNT,
  LOCALITY_NAME_MAX_LENGTH,
  LOCALITY_QUALIFIER_MAX_LENGTH,
  LOCALITY_TIME_ZONE_MAX_LENGTH,
} from '@modules/location/locality/locality.constants';

export class V1AdminLocalityIdParamsDto {
  @IsMongoId()
  id!: string;
}

export class V1AdminLocalitiesGetQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryIso?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  search?: string;
}

export class V1AdminLocalityCreateBodyDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryIso!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(LOCALITY_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(LOCALITY_QUALIFIER_MAX_LENGTH)
  qualifier?: string;

  @IsArray()
  @ArrayMaxSize(LOCALITY_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(LOCALITY_NAME_MAX_LENGTH, { each: true })
  aliases!: string[];

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(LOCALITY_TIME_ZONE_MAX_LENGTH)
  @IsTimeZone()
  timeZone!: string;
}

export class V1AdminLocalityPatchBodyDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(LOCALITY_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(LOCALITY_QUALIFIER_MAX_LENGTH)
  qualifier?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LOCALITY_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(LOCALITY_NAME_MAX_LENGTH, { each: true })
  aliases?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(LOCALITY_TIME_ZONE_MAX_LENGTH)
  @IsTimeZone()
  timeZone?: string;
}
