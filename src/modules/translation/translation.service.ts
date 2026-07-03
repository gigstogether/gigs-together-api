import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Locale, LocaleDocument } from '../locale/locale.schema';
import { Translation, TranslationDocument } from './translation.schema';
import type {
  V1TranslationGetTranslationsRequest,
  V1TranslationGetTranslationsResponseBody,
  V1TranslationValue,
} from './types/requests/v1-translation-get-translations-request';
import { isValidTranslationNamespace } from './translation-identifiers';

@Injectable()
export class TranslationService {
  constructor(
    @InjectModel(Locale.name)
    private readonly localeModel: Model<LocaleDocument>,
    @InjectModel(Translation.name)
    private readonly translationModel: Model<TranslationDocument>,
  ) {}

  private static readonly DEFAULT_LOCALE_ISO: string = 'en';
  private static readonly DEFAULT_NAMESPACE = 'default';

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

    const filter: Record<string, unknown> = {
      locale,
      isActive: true,
    };

    if (namespaces !== undefined) {
      const withoutDefault = namespaces.filter(
        (namespace) => namespace !== TranslationService.DEFAULT_NAMESPACE,
      );
      const includesDefault = namespaces.includes(
        TranslationService.DEFAULT_NAMESPACE,
      );

      if (includesDefault && withoutDefault.length > 0) {
        filter.$or = [
          { namespace: { $in: withoutDefault } },
          { namespace: { $exists: false } },
          { namespace: null },
          { namespace: '' },
        ];
      } else if (includesDefault) {
        filter.$or = [
          { namespace: { $exists: false } },
          { namespace: null },
          { namespace: '' },
        ];
      } else {
        filter.namespace = { $in: withoutDefault };
      }
    }

    const docs = await this.translationModel
      .find(filter, {
        _id: 0,
        key: 1,
        value: 1,
        namespace: 1,
        format: 1,
        kind: 1,
      })
      .sort({ namespace: 1, key: 1 })
      .lean<
        Array<{
          readonly key: string;
          readonly value: string;
          readonly namespace?: string | null;
          readonly format: TranslationDocument['format'];
          readonly kind?: TranslationDocument['kind'];
        }>
      >()
      .exec();

    const translations: Record<string, Record<string, V1TranslationValue>> = {};

    for (const doc of docs) {
      const namespaceRaw = (doc.namespace ?? '').toString().trim();
      const namespace = namespaceRaw || TranslationService.DEFAULT_NAMESPACE;
      translations[namespace] ??= {};
      translations[namespace][doc.key] = {
        value: doc.value,
        format: doc.format,
        kind: doc.kind ?? 'text',
      };
    }

    return { locale, translations };
  }
}
