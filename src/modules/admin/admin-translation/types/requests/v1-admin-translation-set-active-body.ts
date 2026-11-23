import { IsBoolean, Matches } from 'class-validator';

export class V1AdminTranslationSetActiveParamsDto {
  @Matches(/^[\da-f]{24}$/i, { message: 'id has invalid format' })
  id!: string;
}

export class V1AdminTranslationSetActiveBodyDto {
  @IsBoolean()
  isActive!: boolean;
}
