import { IsString, MinLength } from 'class-validator';

export class V1AdminRevalidateTranslationsBodyDto {
  @IsString()
  @MinLength(1)
  namespace!: string;
}
