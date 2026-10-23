import type { StoredTranslationRecord } from '../types/translation-record.types';
import {
  InvalidTranslationRecordError,
  parseTranslationRecord,
} from '../translation-record.parser';
import type { TranslationRecordValidationIssue } from '../translation-record.parser';
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

interface InvalidTranslationDocumentErrorParams {
  documentId: string;
  issues: readonly TranslationRecordValidationIssue[];
}

export class InvalidTranslationDocumentError extends Error {
  documentId: string;
  issues: readonly TranslationRecordValidationIssue[];

  constructor(params: InvalidTranslationDocumentErrorParams) {
    const details = params.issues
      .map((issue) => `${issue.field} ${issue.reason}`)
      .join('; ');

    super(
      `Translation document "${params.documentId}" is invalid: ${details}.`,
    );
    this.name = InvalidTranslationDocumentError.name;
    this.documentId = params.documentId;
    this.issues = [...params.issues];
  }
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
