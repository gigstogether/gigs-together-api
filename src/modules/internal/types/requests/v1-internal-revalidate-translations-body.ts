import { IsString, MinLength } from 'class-validator';

export class V1InternalRevalidateTranslationsBodyDto {
  @IsString()
  @MinLength(1)
  namespace!: string;
}
