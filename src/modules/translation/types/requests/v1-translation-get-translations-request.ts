import type { TranslationFormat, TranslationKind } from '../translation.types';

export interface V1TranslationGetTranslationsRequest {
  /**
   * Raw `Accept-Language` header value (may be "*", "en-US,en;q=0.9", etc).
   * We validate and normalize it on the server.
   */
  readonly acceptLanguage: string | undefined;
  readonly namespacesQuery: string | readonly string[] | undefined;
}

export interface V1TranslationValue {
  readonly value: string;
  readonly format: TranslationFormat;
  readonly kind: TranslationKind;
}

export interface V1TranslationGetTranslationsResponseBody {
  /**
   * Effective locale used for the response.
   * May differ from the requested `accept-language` if it's unsupported/inactive.
   */
  readonly locale: string;
  /**
   * Grouped by namespace.
   */
  readonly translations: Readonly<
    Record<string, Readonly<Record<string, V1TranslationValue>>>
  >;
}
