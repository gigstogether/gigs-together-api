import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { LocaleService } from '../locale/locale.service';
import { TranslationCacheService } from './translation-cache.service';
import {
  isValidTranslationKey,
  isValidTranslationNamespace,
} from './translation-identifiers';
import { TRANSLATION_RECORD_PLAIN_FORMAT } from './translation-record.constants';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';
import type {
  V1TranslationGetTranslationsRequest,
  V1TranslationGetTranslationsResponseBody,
  V1TranslationValue,
} from './types/requests/v1-translation-get-translations-request';
import type { LocaleKeyRegistry } from './types/translation-cache.types';
import type { TranslationRecordPlainFormat } from './types/translation-record.types';
import type { StoredTranslationRecord } from './types/translation-record.types';
import type {
  TranslationFormat,
  TranslationKind,
} from './types/translation.types';

interface SetTranslationRecordActiveParams {
  readonly id: string;
  readonly isActive: boolean;
}

interface UpsertTranslationRecordInput {
  readonly namespace: string;
  readonly locale: string;
  readonly key: string;
  readonly value: string;
  readonly format: TranslationFormat;
  readonly kind: TranslationKind;
  readonly isActive: boolean;
}

interface ListTranslationRecordsParams {
  readonly namespace?: string;
  readonly locale?: string;
}

@Injectable()
export class TranslationService {
  constructor(
    private readonly localeService: LocaleService,
    private readonly translationCacheService: TranslationCacheService,
    @Inject(TRANSLATION_REPOSITORY)
    private readonly translationRepository: TranslationRepository,
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

  listDistinctNamespaces(): Promise<readonly string[]> {
    return this.translationRepository.listDistinctNamespaces();
  }

  listRecords(
    params: ListTranslationRecordsParams,
  ): Promise<readonly StoredTranslationRecord[]> {
    const locale =
      params.locale === undefined
        ? undefined
        : LocaleService.parseLocaleIsoParam(params.locale);

    if (params.namespace === undefined) {
      return this.translationRepository.findAll({ locale });
    }

    const namespace = TranslationService.parseNamespaceParam(params.namespace);

    return this.translationRepository.findByNamespace({
      namespace,
      locale,
    });
  }

  upsertRecord(
    params: UpsertTranslationRecordInput,
  ): Promise<StoredTranslationRecord> {
    return this.translationRepository.upsertRecord({
      namespace: TranslationService.parseNamespaceParam(params.namespace),
      locale: LocaleService.parseLocaleIsoParam(params.locale),
      key: TranslationService.parseKeyParam(params.key),
      value: TranslationService.parseValueParam(params.value),
      format: TranslationService.parseRecordFormatParam(params.format),
      kind: TranslationService.parseRecordKindParam(params.kind),
      isActive: params.isActive,
    });
  }

  async setActiveById(
    params: SetTranslationRecordActiveParams,
  ): Promise<StoredTranslationRecord> {
    const id = TranslationService.parseRecordIdParam(params.id);

    const updated = await this.translationRepository.setActiveById({
      id,
      isActive: params.isActive,
    });

    if (!updated) {
      throw new NotFoundException(`Translation "${id}" not found`);
    }

    return updated;
  }

  private static parseNamespaceParam(namespaceRaw: string): string {
    const namespace = namespaceRaw.trim();
    if (!namespace) {
      throw new BadRequestException('namespace must not be empty');
    }
    if (!isValidTranslationNamespace(namespace)) {
      throw new BadRequestException('namespace has invalid format');
    }

    return namespace;
  }

  private static parseKeyParam(keyRaw: string): string {
    const key = keyRaw.trim();
    if (!key) {
      throw new BadRequestException('key must not be empty');
    }
    if (!isValidTranslationKey(key)) {
      throw new BadRequestException('key has invalid format');
    }

    return key;
  }

  private static parseValueParam(valueRaw: string): string {
    if (typeof valueRaw !== 'string') {
      throw new BadRequestException('value must be a string');
    }
    if (valueRaw.length === 0) {
      throw new BadRequestException('value must not be empty');
    }

    return valueRaw;
  }

  private static parseRecordFormatParam(
    formatRaw: TranslationFormat,
  ): TranslationRecordPlainFormat {
    if (formatRaw !== TRANSLATION_RECORD_PLAIN_FORMAT) {
      throw new BadRequestException('format must be plain');
    }

    return TRANSLATION_RECORD_PLAIN_FORMAT;
  }

  private static parseRecordKindParam(
    kindRaw: TranslationKind,
  ): TranslationKind {
    if (kindRaw !== 'text' && kindRaw !== 'template') {
      throw new BadRequestException('kind must be text or template');
    }

    return kindRaw;
  }

  private static parseRecordIdParam(idRaw: string): string {
    const id = idRaw.trim();
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('id has invalid format');
    }

    return id;
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
