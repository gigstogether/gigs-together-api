import type { TranslationBundleEntry } from './translation.types';

/** Default bulk-refresh interval when TRANSLATION_CACHE_TTL_MS is unset (1 hour). */
export const TRANSLATION_CACHE_DEFAULT_TTL_MS = 3_600_000;

export interface GetNamespaceEntriesParams {
  readonly namespace: string;
  readonly locale?: string;
}

export interface GetTranslationCacheEntryParams {
  readonly namespace: string;
  readonly key: string;
  readonly locale: string;
}

export interface RevalidateTranslationNamespaceParams {
  readonly namespace: string;
}

export type LocaleKeyRegistry = ReadonlyMap<string, TranslationBundleEntry>;

export type NamespaceLocaleRegistry = ReadonlyMap<string, LocaleKeyRegistry>;

export type TranslationCacheIndex = ReadonlyMap<
  string,
  NamespaceLocaleRegistry
>;
