import { BadRequestException, Injectable } from '@nestjs/common';
import { LocaleService } from '../locale/locale.service';
import { TranslationCacheService } from './translation-cache.service';
import { isValidTranslationNamespace } from './translation-identifiers';
import type {
  V1TranslationGetTranslationsRequest,
  V1TranslationGetTranslationsResponseBody,
  V1TranslationValue,
} from './types/requests/v1-translation-get-translations-request';
import type { LocaleKeyRegistry } from './types/translation-cache.types';

@Injectable()
export class TranslationService {
  constructor(
    private readonly localeService: LocaleService,
    private readonly translationCacheService: TranslationCacheService,
  ) {}

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

  getTranslationsV1(
    request: V1TranslationGetTranslationsRequest,
  ): V1TranslationGetTranslationsResponseBody {
    const locale = this.localeService.resolveLocale(request.acceptLanguage);

    const namespaces = TranslationService.parseNamespacesQuery(
      request.namespacesQuery,
    );

    const targetNamespaces =
      namespaces ?? this.translationCacheService.listNamespaces();

    const translations: Record<string, Record<string, V1TranslationValue>> = {};

    for (const namespace of targetNamespaces) {
      const localeRegistry = this.translationCacheService.getNamespaceEntries({
        namespace,
        locale,
      });

      if (localeRegistry.size === 0) {
        continue;
      }

      translations[namespace] =
        TranslationService.toV1TranslationValues(localeRegistry);
    }

    return { locale, translations };
  }

  private static toV1TranslationValues(
    localeRegistry: LocaleKeyRegistry,
  ): Record<string, V1TranslationValue> {
    const values: Record<string, V1TranslationValue> = {};

    for (const [key, entry] of localeRegistry) {
      values[key] = {
        value: entry.value,
        format: entry.format,
        kind: entry.kind,
      };
    }

    return values;
  }
}
