import type { TranslationBundleEntry } from './translation.types';

/** Default bulk-refresh interval when TRANSLATION_CACHE_TTL_MS is unset (1 hour). */
export const TRANSLATION_CACHE_DEFAULT_TTL_MS = 3_600_000;

export type LocaleKeyRegistry = ReadonlyMap<string, TranslationBundleEntry>;

export type NamespaceLocaleRegistry = ReadonlyMap<string, LocaleKeyRegistry>;

export type TranslationCacheIndex = ReadonlyMap<
  string,
  NamespaceLocaleRegistry
>;
