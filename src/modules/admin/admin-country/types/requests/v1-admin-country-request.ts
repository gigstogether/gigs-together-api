import { Transform } from 'class-transformer';
import { IsISO31661Alpha2 } from 'class-validator';

export class V1AdminCountryCreateBodyDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  iso!: string;
}
