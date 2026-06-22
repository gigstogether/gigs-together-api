import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  SupportedLanguage,
  UpdateLanguageByIsoParams,
  UpdateLanguagesOrderParams,
} from './types/language.types';
import { InjectModel } from '@nestjs/mongoose';
import { LanguageDocument, Language } from './language.schema';
import { Model } from 'mongoose';
import { Translation, TranslationDocument } from './translation.schema';
import type {
  V1LanguageGetTranslationsRequest,
  V1LanguageGetTranslationsResponseBody,
} from './types/requests/v1-language-get-translations-request';

@Injectable()
export class LanguageService {
  constructor(
    @InjectModel(Language.name)
    private readonly languageModel: Model<LanguageDocument>,
    @InjectModel(Translation.name)
    private readonly translationModel: Model<TranslationDocument>,
  ) {}

  private static readonly DEFAULT_LANGUAGE_ISO: string = 'en';
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

  private static normalizeLanguageIsoParam(isoRaw: string): string {
    const iso = isoRaw.trim().toLowerCase();
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(iso)) {
      throw new BadRequestException('iso has invalid format');
    }
    return iso;
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
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    const unique = [...new Set(parts)];
    if (unique.length === 0) return undefined;

    const MAX_NAMESPACES = 50;
    if (unique.length > MAX_NAMESPACES) {
      throw new BadRequestException(
        `Too many namespaces requested (max ${MAX_NAMESPACES}).`,
      );
    }

    const isValid = (ns: string) =>
      ns === LanguageService.DEFAULT_NAMESPACE ||
      /^[a-z0-9][a-z0-9_-]{0,63}$/.test(ns);

    const invalid = unique.filter((ns) => !isValid(ns));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid namespaces: ${invalid.map((x) => `"${x}"`).join(', ')}`,
      );
    }

    return unique;
  }

  private async resolveLocale(acceptLanguageRaw?: string): Promise<string> {
    const requested =
      LanguageService.normalizeAcceptLanguage(acceptLanguageRaw);
    if (!requested) return LanguageService.DEFAULT_LANGUAGE_ISO;

    const supported = await this.languageModel
      .find({ isActive: true }, { _id: 0, iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    const set = new Set(supported.map((x) => x.iso));
    return set.has(requested)
      ? requested
      : LanguageService.DEFAULT_LANGUAGE_ISO;
  }

  getLanguagesV1(): Promise<readonly SupportedLanguage[]> {
    return this.languageModel
      .find(
        { isActive: true },
        { _id: 0, iso: 1, name: 1, isActive: 1, order: 1 },
      )
      .sort({ order: 1, iso: 1 })
      .lean<SupportedLanguage[]>()
      .exec();
  }

  getAllLanguagesOrdered(): Promise<readonly SupportedLanguage[]> {
    return this.languageModel
      .find({}, { _id: 0, iso: 1, name: 1, isActive: 1, order: 1 })
      .sort({ order: 1, iso: 1 })
      .lean<SupportedLanguage[]>()
      .exec();
  }

  async updateLanguageByIso(
    params: UpdateLanguageByIsoParams,
  ): Promise<SupportedLanguage> {
    const iso = LanguageService.normalizeLanguageIsoParam(params.iso);
    const update: Partial<Language> = {};

    if (params.name !== undefined) {
      const name = params.name.trim();
      if (!name) {
        throw new BadRequestException('name must not be empty');
      }
      update.name = name;
    }

    if (params.isActive !== undefined) {
      update.isActive = params.isActive;
    }

    if (params.order !== undefined) {
      if (!Number.isInteger(params.order) || params.order < 0) {
        throw new BadRequestException('order must be a non-negative integer');
      }
      update.order = params.order;
    }

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    if (params.isActive === false) {
      const otherActiveCount = await this.languageModel
        .countDocuments({ isActive: true, iso: { $ne: iso } })
        .exec();
      if (otherActiveCount === 0) {
        throw new BadRequestException(
          'Cannot deactivate the last active language',
        );
      }
    }

    const updated = await this.languageModel
      .findOneAndUpdate({ iso }, update, { returnDocument: 'after' })
      .select({ _id: 0, iso: 1, name: 1, isActive: 1, order: 1 })
      .lean<SupportedLanguage>()
      .exec();

    if (!updated) {
      throw new NotFoundException(`Language "${iso}" not found`);
    }

    return updated;
  }

  async updateLanguagesOrder(
    params: UpdateLanguagesOrderParams,
  ): Promise<readonly SupportedLanguage[]> {
    const updates = params.languages;

    if (updates.length < 2) {
      throw new BadRequestException('At least two languages must be updated');
    }

    const normalizedUpdates = updates.map((update) => {
      const order = update.order;
      if (!Number.isInteger(order) || order < 0) {
        throw new BadRequestException('order must be a non-negative integer');
      }
      return {
        iso: LanguageService.normalizeLanguageIsoParam(update.iso),
        order,
      };
    });

    const isos = normalizedUpdates.map((update) => update.iso);
    if (new Set(isos).size !== isos.length) {
      throw new BadRequestException('Duplicate iso values in request');
    }

    const orders = normalizedUpdates.map((update) => update.order);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('Duplicate order values in request');
    }

    const existing = await this.languageModel
      .find({ iso: { $in: isos } }, { iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    if (existing.length !== isos.length) {
      const existingIsos = new Set(existing.map((language) => language.iso));
      const missingIsos = isos.filter((iso) => !existingIsos.has(iso));
      throw new NotFoundException(
        `Language(s) not found: ${missingIsos.join(', ')}`,
      );
    }

    await this.languageModel.bulkWrite(
      normalizedUpdates.map((update) => ({
        updateOne: {
          filter: { iso: update.iso },
          update: { $set: { order: update.order } },
        },
      })),
    );

    return this.getAllLanguagesOrdered();
  }

  async getTranslationsV1(
    request: V1LanguageGetTranslationsRequest,
  ): Promise<V1LanguageGetTranslationsResponseBody> {
    const locale = await this.resolveLocale(request.acceptLanguage);

    const namespaces = LanguageService.parseNamespacesQuery(
      request.namespacesQuery,
    );

    const filter: Record<string, unknown> = {
      locale,
      isActive: true,
    };

    if (namespaces !== undefined) {
      const withoutDefault = namespaces.filter(
        (ns) => ns !== LanguageService.DEFAULT_NAMESPACE,
      );
      const includesDefault = namespaces.includes(
        LanguageService.DEFAULT_NAMESPACE,
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
      .find(filter, { _id: 0, key: 1, value: 1, namespace: 1, format: 1 })
      .sort({ namespace: 1, key: 1 })
      .lean<
        Array<{
          readonly key: string;
          readonly value: string;
          readonly namespace?: string | null;
          readonly format: TranslationDocument['format'];
        }>
      >()
      .exec();

    const translations: Record<
      string,
      Record<
        string,
        {
          readonly value: string;
          readonly format: TranslationDocument['format'];
        }
      >
    > = {};

    for (const doc of docs) {
      const namespaceRaw = (doc.namespace ?? '')
        .toString()
        .trim()
        .toLowerCase();
      const namespace = namespaceRaw || LanguageService.DEFAULT_NAMESPACE;
      translations[namespace] ??= {};
      translations[namespace][doc.key] = {
        value: doc.value,
        format: doc.format,
      };
    }

    return { locale, translations };
  }
}
