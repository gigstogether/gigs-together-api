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
  VENUE_ALIAS_MAX_COUNT,
  VENUE_NAME_MAX_LENGTH,
} from '@modules/location/venue/venue.constants';

export class V1AdminVenueIdParamsDto {
  @IsMongoId()
  id!: string;
}

export class V1AdminVenuesGetQueryDto {
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

export class V1AdminVenueCreateBodyDto {
  @IsMongoId()
  localityId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(VENUE_NAME_MAX_LENGTH)
  name!: string;

  @IsArray()
  @ArrayMaxSize(VENUE_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(VENUE_NAME_MAX_LENGTH, { each: true })
  aliases!: string[];

  @IsBoolean()
  isActive!: boolean;
}

export class V1AdminVenuePatchBodyDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(VENUE_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(VENUE_ALIAS_MAX_COUNT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(VENUE_NAME_MAX_LENGTH, { each: true })
  aliases?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
