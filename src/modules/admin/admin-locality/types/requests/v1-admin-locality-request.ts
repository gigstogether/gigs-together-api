import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  LOCALITY_TIME_ZONE_MAX_LENGTH,
} from '@modules/location/locality/locality.constants';

export class V1AdminLocalityIdParamsDto {
  @IsMongoId()
  id!: string;
}

export class V1AdminLocalitiesGetQueryDto {
  @IsOptional()
  @IsMongoId()
  regionId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  search?: string;
}

export class V1AdminLocalityCreateBodyDto {
  @IsMongoId()
  regionId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(LOCALITY_NAME_MAX_LENGTH)
  name!: string;

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
