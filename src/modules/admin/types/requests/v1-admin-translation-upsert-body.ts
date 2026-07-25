import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, MinLength } from 'class-validator';
import { TRANSLATION_RECORD_PLAIN_FORMAT } from '../../../translation/translation-record.constants';
import {
  IsTranslationKey,
  IsTranslationNamespace,
} from '../../../translation/validators/translation-class-validator';
import type { TranslationRecordPlainFormat } from '../../../translation/types/translation-record.types';
import type {
  TranslationFormat,
  TranslationKind,
} from '../../../translation/types/translation.types';

const TRANSLATION_RECORD_FORMAT_VALUES = [
  TRANSLATION_RECORD_PLAIN_FORMAT,
] as const satisfies readonly TranslationFormat[];

const TRANSLATION_RECORD_KIND_VALUES = [
  'text',
  'template',
] as const satisfies readonly TranslationKind[];

export class V1AdminTranslationUpsertBodyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @IsTranslationNamespace()
  namespace!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(1)
  locale!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @IsTranslationKey()
  key!: string;

  @IsString()
  @MinLength(1)
  value!: string;

  @IsIn(TRANSLATION_RECORD_FORMAT_VALUES)
  format!: TranslationRecordPlainFormat;

  @IsIn(TRANSLATION_RECORD_KIND_VALUES)
  kind!: TranslationKind;

  @IsBoolean()
  isActive!: boolean;
}
