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
  locale: unknown;
  namespace: unknown;
  key: unknown;
  issues: readonly TranslationRecordValidationIssue[];
}

type TranslationDocumentIdentifierField = 'namespace' | 'key' | 'locale';

export class InvalidTranslationDocumentError extends Error {
  documentId: string;
  issues: readonly TranslationRecordValidationIssue[];

  constructor(params: InvalidTranslationDocumentErrorParams) {
    const details = params.issues
      .map((issue) => `${issue.field} ${issue.reason}`)
      .join('; ');
    const identifiers = [
      formatDiagnosticField('namespace', params.namespace),
      formatDiagnosticField('key', params.key),
      formatDiagnosticField('locale', params.locale),
    ].join(', ');

    super(
      `Translation document "${params.documentId}" (${identifiers}) is invalid: ${details}.`,
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

function formatDiagnosticField(
  field: TranslationDocumentIdentifierField,
  value: unknown,
): string {
  if (value === undefined) {
    return `${field}=<missing>`;
  }

  if (value === null) {
    return `${field}=null`;
  }

  if (typeof value === 'string') {
    return `${field}=${JSON.stringify(value)}`;
  }

  return `${field}=<invalid:${typeof value}>`;
}
