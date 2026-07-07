import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Locale, LocaleDocument } from '../locale/locale.schema';
import type {
  V1TranslationGetTranslationsRequest,
  V1TranslationGetTranslationsResponseBody,
  V1TranslationValue,
} from './types/requests/v1-translation-get-translations-request';
import type {
  TranslationBundleEntry,
  TranslationEntriesByLocale,
} from './types/translation.types';
import { isValidTranslationNamespace } from './translation-identifiers';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';

interface GetActiveNamespaceTranslationsParams {
  readonly namespace: string;
}

@Injectable()
export class TranslationService {
  constructor(
    @InjectModel(Locale.name)
    private readonly localeModel: Model<LocaleDocument>,
    @Inject(TRANSLATION_REPOSITORY)
    private readonly translationRepository: TranslationRepository,
  ) {}

  private static readonly DEFAULT_LOCALE_ISO: string = 'en';

  private static normalizeAcceptLanguage(value?: string): string | undefined {
    if (!value) return undefined;
    const first = value.split(',')[0]?.trim(); // "en-US;q=0.9" or "*"
    if (!first || first === '*') return undefined;
    const withoutQ = first.split(';')[0]?.trim(); // "en-US"
    const primary = withoutQ.split('-')[0]?.trim().toLowerCase(); // "en"
    if (!primary) return undefined;
    return primary;
  }

  private static parseNamespacesQuery(
    namespacesQuery: string | readonly string[] | undefined,
  ): readonly string[] | undefined {
    if (namespacesQuery === undefined) return undefined;

    const rawList = Array.isArray(namespacesQuery)
      ? namespacesQuery
      : [namespacesQuery];

    const parts = rawList
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const unique = [...new Set(parts)];
    if (unique.length === 0) return undefined;

    const maxNamespaces = 50;
    if (unique.length > maxNamespaces) {
      throw new BadRequestException(
        `Too many namespaces requested (max ${maxNamespaces}).`,
      );
    }

    const isValid = (ns: string) => isValidTranslationNamespace(ns);

    const invalid = unique.filter((ns) => !isValid(ns));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid namespaces: ${invalid.map((item) => `"${item}"`).join(', ')}`,
      );
    }

    return unique;
  }

  private async resolveLocale(acceptLanguageRaw?: string): Promise<string> {
    const requested =
      TranslationService.normalizeAcceptLanguage(acceptLanguageRaw);
    if (!requested) return TranslationService.DEFAULT_LOCALE_ISO;

    const supported = await this.localeModel
      .find({ isActive: true }, { _id: 0, iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    const set = new Set(supported.map((locale) => locale.iso));
    return set.has(requested)
      ? requested
      : TranslationService.DEFAULT_LOCALE_ISO;
  }

  async getTranslationsV1(
    request: V1TranslationGetTranslationsRequest,
  ): Promise<V1TranslationGetTranslationsResponseBody> {
    const locale = await this.resolveLocale(request.acceptLanguage);

    const namespaces = TranslationService.parseNamespacesQuery(
      request.namespacesQuery,
    );

    const entries = await this.translationRepository.findActiveTranslations({
      locale,
      ...(namespaces !== undefined ? { namespaces } : {}),
    });

    const translations: Record<string, Record<string, V1TranslationValue>> = {};

    for (const entry of entries) {
      const namespace = entry.namespace.trim();
      if (namespace.length === 0) {
        throw new InternalServerErrorException(
          `Translation key "${entry.key}" has an empty namespace.`,
        );
      }
      translations[namespace] ??= {};
      translations[namespace][entry.key] = {
        value: entry.value,
        format: entry.format,
        kind: entry.kind ?? 'text',
      };
    }

    return { locale, translations };
  }

  async getActiveNamespaceTranslations(
    params: GetActiveNamespaceTranslationsParams,
  ): Promise<TranslationEntriesByLocale> {
    const namespace = params.namespace.trim();
    if (!isValidTranslationNamespace(namespace)) {
      throw new BadRequestException(
        `Invalid translation namespace "${namespace}".`,
      );
    }

    const records = await this.translationRepository.findActiveByNamespace({
      namespace,
    });

    const byLocale = new Map<string, readonly TranslationBundleEntry[]>();

    for (const record of records) {
      const entry: TranslationBundleEntry = {
        namespace,
        key: record.key,
        value: record.value,
        format: record.format,
        kind: record.kind,
        isActive: record.isActive,
      };
      const existingEntries = byLocale.get(record.locale) ?? [];
      byLocale.set(record.locale, [...existingEntries, entry]);
    }

    return byLocale;
  }
}
