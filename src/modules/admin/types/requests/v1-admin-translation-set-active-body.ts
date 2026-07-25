import { IsBoolean } from 'class-validator';

export class V1AdminTranslationSetActiveBodyDto {
  @IsBoolean()
  isActive!: boolean;
}
