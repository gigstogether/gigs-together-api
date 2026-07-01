import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  SupportedLocale,
  UpdateLocaleByIsoParams,
  UpdateLocalesOrderParams,
} from './types/locale.types';
import { InjectModel } from '@nestjs/mongoose';
import { LocaleDocument, Locale } from './locale.schema';
import { Model } from 'mongoose';
import { Translation, TranslationDocument } from './translation.schema';
import type {
  V1LocaleGetTranslationsRequest,
  V1LocaleGetTranslationsResponseBody,
} from './types/requests/v1-locale-get-translations-request';

@Injectable()
export class LocaleService {
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

  private static normalizeLocaleIsoParam(isoRaw: string): string {
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
      ns === LocaleService.DEFAULT_NAMESPACE ||
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
    const requested = LocaleService.normalizeAcceptLanguage(acceptLanguageRaw);
    if (!requested) return LocaleService.DEFAULT_LOCALE_ISO;

    const supported = await this.localeModel
      .find({ isActive: true }, { _id: 0, iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    const set = new Set(supported.map((x) => x.iso));
    return set.has(requested) ? requested : LocaleService.DEFAULT_LOCALE_ISO;
  }

  getLocalesV1(): Promise<readonly SupportedLocale[]> {
    return this.localeModel
      .find(
        { isActive: true },
        { _id: 0, iso: 1, name: 1, isActive: 1, order: 1 },
      )
      .sort({ order: 1, iso: 1 })
      .lean<SupportedLocale[]>()
      .exec();
  }

  getAllLocalesOrdered(): Promise<readonly SupportedLocale[]> {
    return this.localeModel
      .find({}, { _id: 0, iso: 1, name: 1, isActive: 1, order: 1 })
      .sort({ order: 1, iso: 1 })
      .lean<SupportedLocale[]>()
      .exec();
  }

  async updateLocaleByIso(
    params: UpdateLocaleByIsoParams,
  ): Promise<SupportedLocale> {
    const iso = LocaleService.normalizeLocaleIsoParam(params.iso);
    const update: Partial<Locale> = {};

    if (params.nativeName !== undefined) {
      const name = params.nativeName.trim();
      if (!name) {
        throw new BadRequestException('name must not be empty');
      }
      update.nativeName = name;
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
      const otherActiveCount = await this.localeModel
        .countDocuments({ isActive: true, iso: { $ne: iso } })
        .exec();
      if (otherActiveCount === 0) {
        throw new BadRequestException(
          'Cannot deactivate the last active locale',
        );
      }
    }

    const updated = await this.localeModel
      .findOneAndUpdate({ iso }, update, { returnDocument: 'after' })
      .select({ _id: 0, iso: 1, name: 1, isActive: 1, order: 1 })
      .lean<SupportedLocale>()
      .exec();

    if (!updated) {
      throw new NotFoundException(`Locale "${iso}" not found`);
    }

    return updated;
  }

  async updateLocalesOrder(
    params: UpdateLocalesOrderParams,
  ): Promise<readonly SupportedLocale[]> {
    const updates = params.locales;

    if (updates.length < 2) {
      throw new BadRequestException('At least two locales must be updated');
    }

    const normalizedUpdates = updates.map((update) => {
      const order = update.order;
      if (!Number.isInteger(order) || order < 0) {
        throw new BadRequestException('order must be a non-negative integer');
      }
      return {
        iso: LocaleService.normalizeLocaleIsoParam(update.iso),
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

    const existing = await this.localeModel
      .find({ iso: { $in: isos } }, { iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    if (existing.length !== isos.length) {
      const existingIsos = new Set(existing.map((locale) => locale.iso));
      const missingIsos = isos.filter((iso) => !existingIsos.has(iso));
      throw new NotFoundException(
        `Locale(s) not found: ${missingIsos.join(', ')}`,
      );
    }

    await this.localeModel.bulkWrite(
      normalizedUpdates.map((update) => ({
        updateOne: {
          filter: { iso: update.iso },
          update: { $set: { order: update.order } },
        },
      })),
    );

    return this.getAllLocalesOrdered();
  }

  async getTranslationsV1(
    request: V1LocaleGetTranslationsRequest,
  ): Promise<V1LocaleGetTranslationsResponseBody> {
    const locale = await this.resolveLocale(request.acceptLanguage);

    const namespaces = LocaleService.parseNamespacesQuery(
      request.namespacesQuery,
    );

    const filter: Record<string, unknown> = {
      locale,
      isActive: true,
    };

    if (namespaces !== undefined) {
      const withoutDefault = namespaces.filter(
        (ns) => ns !== LocaleService.DEFAULT_NAMESPACE,
      );
      const includesDefault = namespaces.includes(
        LocaleService.DEFAULT_NAMESPACE,
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
      const namespace = namespaceRaw || LocaleService.DEFAULT_NAMESPACE;
      translations[namespace] ??= {};
      translations[namespace][doc.key] = {
        value: doc.value,
        format: doc.format,
      };
    }

    return { locale, translations };
  }
}
