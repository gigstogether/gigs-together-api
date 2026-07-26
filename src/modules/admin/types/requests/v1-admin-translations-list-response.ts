import type { StoredTranslationRecord } from '../../../translation/types/translation-record.types';

export interface V1AdminTranslationsListResponseBody {
  readonly records: readonly StoredTranslationRecord[];
}
