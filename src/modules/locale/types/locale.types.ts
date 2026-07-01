export interface SupportedLocale {
  readonly iso: string;
  readonly nativeName: string;
  readonly isActive: boolean;
  readonly order: number;
}

export interface UpdateLocaleByIsoParams {
  readonly iso: string;
  readonly nativeName?: string;
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
