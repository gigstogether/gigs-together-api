import type { StoredTranslationRecord } from '../types/translation-record.types';
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

export interface StoredTranslationRecordLeanDocument extends TranslationRecordLeanDocument {
  readonly _id: { toString(): string } | string;
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

  static toStoredTranslationRecord(
    doc: StoredTranslationRecordLeanDocument,
  ): StoredTranslationRecord {
    const id = typeof doc._id === 'string' ? doc._id : doc._id.toString();

    return {
      id,
      ...TranslationRepositoryMapper.toTranslationRecord(doc),
    };
  }

  static toStoredTranslationRecords(
    docs: readonly StoredTranslationRecordLeanDocument[],
  ): readonly StoredTranslationRecord[] {
    return docs.map((doc) =>
      TranslationRepositoryMapper.toStoredTranslationRecord(doc),
    );
  }
}
