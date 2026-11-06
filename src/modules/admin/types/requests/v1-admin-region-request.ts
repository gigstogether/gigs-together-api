import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO31661Alpha2,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  REGION_ALIAS_MAX_COUNT,
  REGION_NAME_MAX_LENGTH,
} from '@modules/location/region/region.constants';

export class V1AdminRegionIdParamsDto {
  @IsMongoId()
  id!: string;
}

export class V1AdminRegionsGetQueryDto {
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

export class V1AdminRegionCreateBodyDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryIso!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(REGION_NAME_MAX_LENGTH)
  name!: string;

  @IsArray()
  @ArrayMaxSize(REGION_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(REGION_NAME_MAX_LENGTH, { each: true })
  aliases!: string[];
}

export class V1AdminRegionPatchBodyDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(REGION_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REGION_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(REGION_NAME_MAX_LENGTH, { each: true })
  aliases?: string[];
}
