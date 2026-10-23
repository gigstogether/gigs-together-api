import type { Logger } from '@nestjs/common';
import { parseTranslationRecord } from './translation-record.parser';
export { parseTranslationBundleEntry } from './translation-record.parser';
import type {
  TranslationBundleEntry,
  TranslationRecord,
} from './types/translation.types';
import type {
  LocaleKeyRegistry,
  NamespaceLocaleRegistry,
  TranslationCacheIndex,
} from './types/translation-cache.types';

export const TRANSLATION_CACHE_DEFAULT_LOCALE = 'en';

export const TELEGRAM_TEMPLATE_NAMESPACE = 'telegram';

function tryParseTranslationRecord(
  value: unknown,
  logger: Logger,
): TranslationRecord | undefined {
  try {
    return parseTranslationRecord(value);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Skipping invalid translation record: ${message}`);
    return undefined;
  }
}

function toTranslationBundleEntry(
  record: TranslationRecord,
): TranslationBundleEntry {
  return {
    namespace: record.namespace,
    key: record.key,
    value: record.value,
    format: record.format,
    kind: record.kind,
    isActive: record.isActive,
  };
}

function indexActiveTranslationEntries(
  entries: readonly TranslationBundleEntry[],
): LocaleKeyRegistry {
  const byKey = new Map<string, TranslationBundleEntry>();

  for (const entry of entries) {
    if (!entry.isActive) {
      continue;
    }
    byKey.set(entry.key, entry);
  }

  return byKey;
}

export function buildNamespaceLocaleRegistry(
  records: readonly TranslationRecord[],
  namespace: string,
  logger: Logger,
): NamespaceLocaleRegistry {
  const byLocale = new Map<string, LocaleKeyRegistry>();

  const recordsByLocale = new Map<string, TranslationRecord[]>();
  for (const rawRecord of records) {
    const record = tryParseTranslationRecord(rawRecord, logger);
    if (record === undefined) {
      continue;
    }

    const existing = recordsByLocale.get(record.locale) ?? [];
    recordsByLocale.set(record.locale, [...existing, record]);
  }

  for (const [locale, localeRecords] of recordsByLocale) {
    const validatedEntries: TranslationBundleEntry[] = [];
    const seenKeys = new Set<string>();

    for (const record of localeRecords) {
      const parsed = toTranslationBundleEntry(record);
      if (parsed.namespace !== namespace) {
        logger.error(
          `Skipping translation key "${parsed.key}" for locale "${locale}": expected namespace "${namespace}", got "${parsed.namespace}".`,
        );
        continue;
      }
      if (seenKeys.has(parsed.key)) {
        logger.error(
          `Skipping duplicate translation key "${parsed.key}" for locale "${locale}" in namespace "${namespace}".`,
        );
        continue;
      }
      seenKeys.add(parsed.key);
      validatedEntries.push(parsed);
    }

    if (validatedEntries.length === 0) {
      logger.error(
        `No valid translations remain for namespace "${namespace}" and locale "${locale}".`,
      );
      continue;
    }

    byLocale.set(locale, indexActiveTranslationEntries(validatedEntries));
  }

  if (byLocale.size === 0) {
    logger.error(`No active translations found for namespace "${namespace}".`);
  }

  if (namespace === TELEGRAM_TEMPLATE_NAMESPACE) {
    const defaultLocaleEntries = byLocale.get(TRANSLATION_CACHE_DEFAULT_LOCALE);
    if (defaultLocaleEntries === undefined || defaultLocaleEntries.size === 0) {
      logger.error(
        `Translations for namespace "${TELEGRAM_TEMPLATE_NAMESPACE}" and default locale "${TRANSLATION_CACHE_DEFAULT_LOCALE}" are missing.`,
      );
    }
  }

  return byLocale;
}

export function buildTranslationCacheIndex(
  records: readonly TranslationRecord[],
  logger: Logger,
): TranslationCacheIndex {
  const recordsByNamespace = new Map<string, TranslationRecord[]>();

  for (const rawRecord of records) {
    const record = tryParseTranslationRecord(rawRecord, logger);
    if (record === undefined) {
      continue;
    }

    const existing = recordsByNamespace.get(record.namespace) ?? [];
    recordsByNamespace.set(record.namespace, [...existing, record]);
  }

  const index = new Map<string, NamespaceLocaleRegistry>();

  for (const [namespace, namespaceRecords] of recordsByNamespace) {
    index.set(
      namespace,
      buildNamespaceLocaleRegistry(namespaceRecords, namespace, logger),
    );
  }

  return index;
}
