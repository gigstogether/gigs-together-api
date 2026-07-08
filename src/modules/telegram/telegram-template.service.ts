import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import type {
  TranslationBundleEntry,
  TranslationEntriesByLocale,
} from '../translation/types/translation.types';
import {
  isValidTranslationKey,
  isValidTranslationNamespace,
} from '../translation/translation-identifiers';
import { TranslationService } from '../translation/translation.service';
import { TranslationTemplateService } from '../translation/translation-template.service';
import type { PlainTemplateParams } from '../translation/types/translation-template.types';
import { isRecord } from '../../shared/utils/is-record';
import type { TelegramTemplateKey } from './telegram-template-keys';

export type { PlainTemplateParams } from '../translation/types/translation-template.types';

type TelegramTemplateRegistry = ReadonlyMap<
  string,
  ReadonlyMap<string, TranslationBundleEntry>
>;

export const TELEGRAM_TEMPLATE_DEFAULT_LOCALE = 'en';

export const TELEGRAM_TEMPLATE_NAMESPACE = 'telegram';

@Injectable()
export class TelegramTemplateService implements OnModuleInit {
  private readonly logger = new Logger(TelegramTemplateService.name);

  private registry: TelegramTemplateRegistry | undefined;

  constructor(
    private readonly translationService: TranslationService,
    private readonly translationTemplateService: TranslationTemplateService,
  ) {}

  async onModuleInit(): Promise<void> {
    const translationsByLocale =
      await this.translationService.getActiveNamespaceTranslations({
        namespace: TELEGRAM_TEMPLATE_NAMESPACE,
      });

    this.registry = this.buildRegistry(translationsByLocale);
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
    return this.translationTemplateService.render({ entry, params });
  }

  private buildRegistry(
    translationsByLocale: TranslationEntriesByLocale,
  ): TelegramTemplateRegistry {
    if (translationsByLocale.size === 0) {
      this.logger.error(
        `No active translations found for namespace "${TELEGRAM_TEMPLATE_NAMESPACE}". Run telegram translation seed migration.`,
      );
      return new Map();
    }

    const registry = new Map<
      string,
      ReadonlyMap<string, TranslationBundleEntry>
    >();

    for (const [locale, entries] of translationsByLocale) {
      const validatedEntries: TranslationBundleEntry[] = [];
      const seenKeys = new Set<string>();

      for (const entry of entries) {
        const parsed = this.tryParseTranslationBundleEntry(entry);
        if (parsed === undefined) {
          continue;
        }
        if (seenKeys.has(parsed.key)) {
          this.logger.error(
            `Skipping duplicate telegram translation key "${parsed.key}" for locale "${locale}".`,
          );
          continue;
        }
        seenKeys.add(parsed.key);
        validatedEntries.push(parsed);
      }

      if (validatedEntries.length === 0) {
        this.logger.error(
          `No valid telegram translations remain for locale "${locale}".`,
        );
        continue;
      }

      registry.set(
        locale,
        TelegramTemplateService.indexActiveTranslationEntries(validatedEntries),
      );
    }

    const defaultLocaleEntries = registry.get(TELEGRAM_TEMPLATE_DEFAULT_LOCALE);
    if (defaultLocaleEntries === undefined || defaultLocaleEntries.size === 0) {
      this.logger.error(
        `Telegram translations for default locale "${TELEGRAM_TEMPLATE_DEFAULT_LOCALE}" are missing.`,
      );
    }

    return registry;
  }

  private tryParseTranslationBundleEntry(
    value: unknown,
  ): TranslationBundleEntry | undefined {
    try {
      return TelegramTemplateService.parseTranslationBundleEntry(value);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Skipping invalid telegram translation entry: ${message}`,
      );
      return undefined;
    }
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

  private static indexActiveTranslationEntries(
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

  private getEntry(
    key: TelegramTemplateKey,
    locale: string,
  ): TranslationBundleEntry {
    const registry = this.registry;
    if (registry === undefined) {
      throw new InternalServerErrorException(
        'Telegram templates are not loaded yet.',
      );
    }

    const normalizedLocale = locale.trim().toLowerCase();
    const entries = registry.get(normalizedLocale);
    const entry = entries?.get(key);

    if (entry === undefined) {
      throw new InternalServerErrorException(
        `Telegram translation "${key}" is missing for locale "${normalizedLocale}".`,
      );
    }

    return entry;
  }
}
