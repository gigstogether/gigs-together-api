export interface SupportedLanguage {
  readonly iso: string;
  /**
   * Default language name in its own language (e.g. "Русский", "Español").
   */
  readonly name: string;
  readonly isActive: boolean;
  readonly order: number;
}

export interface UpdateLanguageByIsoParams {
  readonly iso: string;
  readonly name?: string;
  readonly isActive?: boolean;
  readonly order?: number;
}

export interface LanguageOrderUpdate {
  readonly iso: string;
  readonly order: number;
}

export interface UpdateLanguagesOrderParams {
  readonly languages: readonly LanguageOrderUpdate[];
}
