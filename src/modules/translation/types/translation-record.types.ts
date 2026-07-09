import type { TranslationFormat, TranslationKind } from './translation.types';

export type TranslationRecordPlainFormat = 'plain';

export interface StoredTranslationRecord {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly namespace: string;
  readonly format: TranslationFormat;
  readonly kind: TranslationKind;
  readonly locale: string;
  readonly isActive: boolean;
}
