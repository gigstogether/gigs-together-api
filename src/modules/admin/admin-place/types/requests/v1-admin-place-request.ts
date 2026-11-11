import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PLACE_ALIAS_MAX_COUNT,
  PLACE_NAME_MAX_LENGTH,
} from '@modules/location/place/place.constants';

export class V1AdminPlaceIdParamsDto {
  @IsMongoId()
  id!: string;
}

export class V1AdminPlacesGetQueryDto {
  @IsOptional()
  @IsMongoId()
  localityId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class V1AdminPlaceCreateBodyDto {
  @IsMongoId()
  localityId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(PLACE_NAME_MAX_LENGTH)
  name!: string;

  @IsArray()
  @ArrayMaxSize(PLACE_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(PLACE_NAME_MAX_LENGTH, { each: true })
  aliases!: string[];

  @IsBoolean()
  isActive!: boolean;
}

export class V1AdminPlacePatchBodyDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(PLACE_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PLACE_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(PLACE_NAME_MAX_LENGTH, { each: true })
  aliases?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
