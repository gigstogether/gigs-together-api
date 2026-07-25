import type { LocaleOrderUpdate, SupportedLocale } from '../types/locale.types';

export const LOCALE_REPOSITORY = Symbol('LOCALE_REPOSITORY');

export interface UpdateLocaleRecordFields {
  readonly nativeName?: string;
  readonly isActive?: boolean;
  readonly order?: number;
}

export interface LocaleRepository {
  findActiveLocalesOrdered(): Promise<readonly SupportedLocale[]>;

  findAllLocalesOrdered(): Promise<readonly SupportedLocale[]>;

  countOtherActiveLocales(iso: string): Promise<number>;

  updateLocaleByIso(
    iso: string,
    update: UpdateLocaleRecordFields,
  ): Promise<SupportedLocale | null>;

  findIsosByIsoList(isos: readonly string[]): Promise<readonly string[]>;

  bulkOrderUpdate(updates: readonly LocaleOrderUpdate[]): Promise<void>;
}
