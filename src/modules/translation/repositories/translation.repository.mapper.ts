import type {
  TranslationFormat,
  TranslationKind,
  TranslationRecord,
} from '../types/translation.types';

export interface TranslationRecordLeanDocument {
  readonly locale: string;
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
  readonly format: TranslationFormat;
  readonly kind?: TranslationKind;
  readonly isActive: boolean;
}

export class TranslationRepositoryMapper {
  static toTranslationRecord(
    doc: TranslationRecordLeanDocument,
  ): TranslationRecord {
    return {
      locale: doc.locale.trim().toLowerCase(),
      namespace: doc.namespace.trim(),
      key: doc.key,
      value: doc.value,
      format: doc.format,
      kind: doc.kind ?? 'text',
      isActive: doc.isActive,
    };
  }

  static toTranslationRecords(
    docs: readonly TranslationRecordLeanDocument[],
  ): readonly TranslationRecord[] {
    return docs.map((doc) =>
      TranslationRepositoryMapper.toTranslationRecord(doc),
    );
  }
}
