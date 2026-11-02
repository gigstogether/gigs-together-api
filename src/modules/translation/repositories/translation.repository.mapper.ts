import type { StoredTranslationRecord } from '../types/translation-record.types';
import { InvalidTranslationDocumentError } from '../translation.errors';
import {
  InvalidTranslationRecordError,
  parseTranslationRecord,
} from '../translation-record.parser';
import type { TranslationRecord } from '../types/translation.types';

export interface TranslationRecordLeanDocument {
  _id: { toString(): string } | string;
  locale?: unknown;
  namespace?: unknown;
  key?: unknown;
  value?: unknown;
  format?: unknown;
  kind?: unknown;
  isActive?: unknown;
}

export class TranslationRepositoryMapper {
  static toTranslationRecord(
    doc: TranslationRecordLeanDocument,
  ): TranslationRecord {
    const id = TranslationRepositoryMapper.getDocumentId(doc);

    try {
      return parseTranslationRecord(doc);
    } catch (e) {
      if (!(e instanceof InvalidTranslationRecordError)) {
        throw e;
      }

      throw new InvalidTranslationDocumentError({
        documentId: id,
        locale: doc.locale,
        namespace: doc.namespace,
        key: doc.key,
        issues: e.issues,
      });
    }
  }

  static toStoredTranslationRecord(
    doc: TranslationRecordLeanDocument,
  ): StoredTranslationRecord {
    const id = TranslationRepositoryMapper.getDocumentId(doc);

    return {
      id,
      ...TranslationRepositoryMapper.toTranslationRecord(doc),
    };
  }

  private static getDocumentId(doc: TranslationRecordLeanDocument): string {
    return typeof doc._id === 'string' ? doc._id : doc._id.toString();
  }
}
