import type { StoredTranslationRecord } from '@modules/translation/types/translation-record.types';

export interface V1AdminTranslationsListResponseBody {
  readonly records: readonly StoredTranslationRecord[];
}
