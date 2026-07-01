import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class V1AdminLocalePatchBodyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class V1AdminLocaleOrderItemDto {
  @IsString()
  @MinLength(1)
  iso!: string;

  @IsInt()
  @Min(0)
  order!: number;
}

export class V1AdminLocalesOrderPatchBodyDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => V1AdminLocaleOrderItemDto)
  locales!: V1AdminLocaleOrderItemDto[];
}
