import type { Logger } from '@nestjs/common';
import {
  isValidTranslationKey,
  isValidTranslationNamespace,
} from './translation-identifiers';
import type {
  TranslationBundleEntry,
  TranslationRecord,
} from './types/translation.types';
import type {
  LocaleKeyRegistry,
  NamespaceLocaleRegistry,
  TranslationCacheIndex,
} from './types/translation-cache.types';
import { isRecord } from '../../shared/utils/is-record';

export const TRANSLATION_CACHE_DEFAULT_LOCALE = 'en';

export const TELEGRAM_TEMPLATE_NAMESPACE = 'telegram';

export function parseTranslationBundleEntry(
  value: unknown,
): TranslationBundleEntry {
  if (!isRecord(value)) {
    throw new Error('Translation bundle entry must be an object.');
  }

  const namespace = value.namespace;
  const key = value.key;
  const entryValue = value.value;
  const format = value.format;
  const kind = value.kind;
  const isActive = value.isActive;

  if (typeof namespace !== 'string' || namespace.trim().length === 0) {
    throw new Error(
      'Translation bundle entry namespace must be a non-empty string.',
    );
  }
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Translation bundle entry key must be a non-empty string.');
  }
  if (typeof entryValue !== 'string') {
    throw new Error(
      `Translation bundle entry "${key}" value must be a string.`,
    );
  }
  if (format !== 'plain' && format !== 'icu') {
    throw new Error(`Translation bundle entry "${key}" format is invalid.`);
  }
  if (kind !== 'text' && kind !== 'template') {
    throw new Error(`Translation bundle entry "${key}" kind is invalid.`);
  }
  if (typeof isActive !== 'boolean') {
    throw new Error(
      `Translation bundle entry "${key}" isActive must be a boolean.`,
    );
  }

  const normalizedNamespace = namespace.trim();
  const normalizedKey = key.trim();

  if (!isValidTranslationNamespace(normalizedNamespace)) {
    throw new Error(
      `Translation bundle entry "${normalizedKey}" namespace must be camelCase.`,
    );
  }
  if (!isValidTranslationKey(normalizedKey)) {
    throw new Error(
      `Translation bundle entry "${normalizedKey}" key must be camelCase.`,
    );
  }

  return {
    namespace: normalizedNamespace,
    key: normalizedKey,
    value: entryValue,
    format,
    kind,
    isActive,
  };
}

function tryParseTranslationBundleEntry(
  value: unknown,
  logger: Logger,
): TranslationBundleEntry | undefined {
  try {
    return parseTranslationBundleEntry(value);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Skipping invalid translation entry: ${message}`);
    return undefined;
  }
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
  for (const record of records) {
    const existing = recordsByLocale.get(record.locale) ?? [];
    recordsByLocale.set(record.locale, [...existing, record]);
  }

  for (const [locale, localeRecords] of recordsByLocale) {
    const validatedEntries: TranslationBundleEntry[] = [];
    const seenKeys = new Set<string>();

    for (const record of localeRecords) {
      const parsed = tryParseTranslationBundleEntry(record, logger);
      if (parsed === undefined) {
        continue;
      }
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

  for (const record of records) {
    const namespace = record.namespace.trim();
    if (namespace.length === 0) {
      logger.error(
        `Skipping translation record with missing namespace (key "${record.key}", locale "${record.locale}").`,
      );
      continue;
    }

    const existing = recordsByNamespace.get(namespace) ?? [];
    recordsByNamespace.set(namespace, [...existing, record]);
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
