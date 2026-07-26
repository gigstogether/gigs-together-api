import type { SupportedLocale } from '../types/locale.types';

export interface LocaleLeanDocument {
  readonly iso: string;
  readonly nativeName: string;
  readonly isActive: boolean;
  readonly order: number;
}

export class LocaleRepositoryMapper {
  static toSupportedLocale(doc: LocaleLeanDocument): SupportedLocale {
    return {
      iso: doc.iso.trim().toLowerCase(),
      nativeName: doc.nativeName,
      isActive: doc.isActive,
      order: doc.order,
    };
  }

  static toSupportedLocales(
    docs: readonly LocaleLeanDocument[],
  ): readonly SupportedLocale[] {
    return docs.map((doc) => LocaleRepositoryMapper.toSupportedLocale(doc));
  }

  static toActiveSupportedLocales(
    docs: readonly LocaleLeanDocument[],
  ): readonly SupportedLocale[] {
    return LocaleRepositoryMapper.toSupportedLocales(docs).filter(
      (locale) => locale.iso.length > 0,
    );
  }
}
