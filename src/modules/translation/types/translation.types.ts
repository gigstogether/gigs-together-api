export type TranslationFormat = 'plain' | 'icu';

export type TranslationKind = 'text' | 'template';

export interface TranslationRecord {
  readonly key: string;
  readonly value: string;
  readonly namespace: string;
  readonly format: TranslationFormat;
  readonly kind: TranslationKind;
  readonly locale: string;
  readonly isActive: boolean;
}

export interface TranslationEntry {
  readonly key: string;
  readonly value: string;
  readonly namespace?: string | null;
  readonly format: TranslationFormat;
  readonly kind?: TranslationKind;
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
