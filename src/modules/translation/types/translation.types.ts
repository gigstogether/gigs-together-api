import type { TranslationFormat, TranslationKind } from '../translation.schema';

export type { TranslationFormat, TranslationKind };

export interface TranslationRecord {
  readonly locale: string;
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
  readonly format: TranslationFormat;
  readonly kind: TranslationKind;
  readonly isActive: boolean;
}

export type TranslationBundleEntry = Omit<TranslationRecord, 'locale'>;

/**
 * TODO
 * Temporary locale-grouped seed bundle until MongoDB translations are seeded.
 */
export interface TranslationLocaleBundle {
  readonly locale: string;
  readonly entries: readonly TranslationBundleEntry[];
}
