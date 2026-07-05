import type { TranslationFormat, TranslationKind } from '../translation.schema';

export type { TranslationFormat, TranslationKind };

interface TranslationRecord {
  readonly locale: string;
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
  readonly format: TranslationFormat;
  readonly kind: TranslationKind;
  readonly isActive: boolean;
}

export type TranslationBundleEntry = Omit<TranslationRecord, 'locale'>;

export type TranslationEntriesByLocale = ReadonlyMap<
  string,
  readonly TranslationBundleEntry[]
>;

export interface TranslationLocaleBundle {
  readonly locale: string;
  readonly entries: readonly TranslationBundleEntry[];
}
