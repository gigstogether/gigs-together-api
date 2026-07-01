export interface SupportedLocale {
  readonly iso: string;
  /**
   * Default locale name in its own language (e.g. "Русский", "Español").
   */
  readonly name: string; // TODO: rename to nativeName?
  readonly isActive: boolean;
  readonly order: number;
}

export interface UpdateLocaleByIsoParams {
  readonly iso: string;
  readonly name?: string;
  readonly isActive?: boolean;
  readonly order?: number;
}

export interface LocaleOrderUpdate {
  readonly iso: string;
  readonly order: number;
}

export interface UpdateLocalesOrderParams {
  readonly locales: readonly LocaleOrderUpdate[];
}
