import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type {
  TranslationBundleEntry,
  TranslationLocaleBundle,
} from '../translation/types/translation.types';
import {
  isValidTranslationKey,
  isValidTranslationNamespace,
} from '../translation/translation-identifiers';
import { isRecord } from '../../shared/utils/is-record';
import enTelegramTemplateBundleJson from './templates/en.json';
import type { TelegramTemplateKey } from './telegram-template-keys';

type PlainTemplateParams = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export const TELEGRAM_TEMPLATE_DEFAULT_LOCALE = 'en';

const TELEGRAM_TEMPLATE_NAMESPACE = 'telegram';

const TELEGRAM_TEMPLATE_BUNDLES_BY_LOCALE = {
  en: enTelegramTemplateBundleJson,
} as const satisfies Readonly<Record<string, unknown>>;

@Injectable()
export class TelegramTemplateService {
  private readonly entriesByLocale: ReadonlyMap<
    string,
    ReadonlyMap<string, TranslationBundleEntry>
  >;

  constructor() {
    this.entriesByLocale = TelegramTemplateService.createRegistry();
  }

  getText(
    key: TelegramTemplateKey,
    locale: string = TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
  ): string {
    const entry = this.getEntry(key, locale);
    return entry.value;
  }

  render(
    key: TelegramTemplateKey,
    params: PlainTemplateParams,
    locale: string = TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
  ): string {
    const entry = this.getEntry(key, locale);
    if (entry.kind !== 'template') {
      throw new InternalServerErrorException(
        `Telegram translation "${key}" is not a template.`,
      );
    }
    if (entry.format !== 'plain') {
      throw new InternalServerErrorException(
        `Telegram template "${key}" uses unsupported format "${entry.format}".`,
      );
    }

    return TelegramTemplateService.renderPlainTemplate(entry.value, params);
  }

  private static createRegistry(): ReadonlyMap<
    string,
    ReadonlyMap<string, TranslationBundleEntry>
  > {
    const enBundle = TelegramTemplateService.getTelegramTemplateBundle(
      TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
    );

    return new Map([
      [
        enBundle.locale,
        TelegramTemplateService.indexTelegramTemplateEntries(enBundle.entries),
      ],
    ]);
  }

  private static getTelegramTemplateBundle(
    locale: string,
  ): TranslationLocaleBundle {
    const normalizedLocale = locale.trim().toLowerCase();
    const raw =
      TELEGRAM_TEMPLATE_BUNDLES_BY_LOCALE[
        normalizedLocale as keyof typeof TELEGRAM_TEMPLATE_BUNDLES_BY_LOCALE
      ];

    if (raw === undefined) {
      throw new Error(
        `Telegram template bundle is missing for locale "${normalizedLocale}".`,
      );
    }

    const bundle = TelegramTemplateService.parseTelegramTemplateBundle(raw);

    if (bundle.locale !== normalizedLocale) {
      throw new Error(
        `Telegram template bundle locale mismatch: expected "${normalizedLocale}", got "${bundle.locale}".`,
      );
    }

    return bundle;
  }

  private static parseTelegramTemplateBundle(
    raw: unknown,
  ): TranslationLocaleBundle {
    if (!isRecord(raw)) {
      throw new Error('Telegram template bundle must be an object.');
    }

    const locale = raw.locale;
    const entries = raw.entries;

    if (typeof locale !== 'string' || locale.trim().length === 0) {
      throw new Error('Telegram template bundle locale must be a string.');
    }
    if (!Array.isArray(entries)) {
      throw new Error('Telegram template bundle entries must be an array.');
    }

    const parsedEntries = entries.map(
      TelegramTemplateService.parseTranslationBundleEntry,
    );
    const keys = parsedEntries.map((entry) => entry.key);
    if (new Set(keys).size !== keys.length) {
      throw new Error('Telegram template bundle contains duplicate keys.');
    }

    return {
      locale: locale.trim().toLowerCase(),
      entries: parsedEntries,
    };
  }

  private static parseTranslationBundleEntry(
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
      throw new Error(
        'Translation bundle entry key must be a non-empty string.',
      );
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

    if (normalizedNamespace !== TELEGRAM_TEMPLATE_NAMESPACE) {
      throw new Error(
        `Translation bundle entry "${normalizedKey}" namespace must be "${TELEGRAM_TEMPLATE_NAMESPACE}".`,
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

  private static indexTelegramTemplateEntries(
    entries: readonly TranslationBundleEntry[],
  ): ReadonlyMap<string, TranslationBundleEntry> {
    const byKey = new Map<string, TranslationBundleEntry>();

    for (const entry of entries) {
      if (!entry.isActive) {
        continue;
      }
      byKey.set(entry.key, entry);
    }

    return byKey;
  }

  private static renderPlainTemplate(
    template: string,
    params: PlainTemplateParams,
  ): string {
    return template.replace(/\{(\w+)\}/g, (match, rawKey: string) => {
      const value = params[rawKey];
      if (value === null || value === undefined) {
        return match;
      }
      return String(value);
    });
  }

  private getEntry(
    key: TelegramTemplateKey,
    locale: string,
  ): TranslationBundleEntry {
    const normalizedLocale = locale.trim().toLowerCase();
    const entries = this.entriesByLocale.get(normalizedLocale);
    const entry = entries?.get(key);

    if (!entry) {
      throw new InternalServerErrorException(
        `Telegram translation "${key}" is missing for locale "${normalizedLocale}".`,
      );
    }

    return entry;
  }
}
