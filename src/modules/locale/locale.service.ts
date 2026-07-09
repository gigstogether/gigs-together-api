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

@Injectable()
export class LocaleService {
  constructor(
    @InjectModel(Locale.name)
    private readonly localeModel: Model<LocaleDocument>,
  ) {}

  private static normalizeLocaleIsoParam(isoRaw: string): string {
    const iso = isoRaw.trim().toLowerCase();
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(iso)) {
      throw new BadRequestException('iso has invalid format');
    }
    return iso;
  }

  getLocalesV1(): Promise<readonly SupportedLocale[]> {
    return this.localeModel
      .find(
        { isActive: true },
        { _id: 0, iso: 1, nativeName: 1, isActive: 1, order: 1 },
      )
      .sort({ order: 1, iso: 1 })
      .lean<SupportedLocale[]>()
      .exec();
  }

  getAllLocalesOrdered(): Promise<readonly SupportedLocale[]> {
    return this.localeModel
      .find({}, { _id: 0, iso: 1, nativeName: 1, isActive: 1, order: 1 })
      .sort({ order: 1, iso: 1 })
      .lean<SupportedLocale[]>()
      .exec();
  }

  async getActiveLocaleIsos(): Promise<readonly string[]> {
    const locales = await this.localeModel
      .find({ isActive: true }, { _id: 0, iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    return locales
      .map((locale) => locale.iso.trim().toLowerCase())
      .filter((iso) => iso.length > 0);
  }

  async updateLocaleByIso(
    params: UpdateLocaleByIsoParams,
  ): Promise<SupportedLocale> {
    const iso = LocaleService.normalizeLocaleIsoParam(params.iso);
    const update: Partial<Locale> = {};

    if (params.nativeName !== undefined) {
      const trimmedNativeName = params.nativeName.trim();
      if (!trimmedNativeName) {
        throw new BadRequestException('nativeName must not be empty');
      }
      update.nativeName = trimmedNativeName;
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
      .select({ _id: 0, iso: 1, nativeName: 1, isActive: 1, order: 1 })
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
}
