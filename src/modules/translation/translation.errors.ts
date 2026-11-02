import type { TranslationRecordValidationIssue } from './translation-record.parser';

interface MissingTranslationErrorParams {
  namespace: string;
  key: string;
  locale: string;
}

interface InvalidTranslationDocumentErrorParams {
  documentId: string;
  locale: unknown;
  namespace: unknown;
  key: unknown;
  issues: readonly TranslationRecordValidationIssue[];
}

type TranslationDocumentIdentifierField = 'namespace' | 'key' | 'locale';

export class MissingTranslationError extends Error {
  namespace: string;
  key: string;
  locale: string;

  constructor(params: MissingTranslationErrorParams) {
    super(
      `Translation "${params.key}" is missing for namespace "${params.namespace}" and locale "${params.locale}".`,
    );
    this.name = MissingTranslationError.name;
    this.namespace = params.namespace;
    this.key = params.key;
    this.locale = params.locale;
  }
}

export class InvalidTranslationDocumentError extends Error {
  documentId: string;
  namespace: string;
  key: string;
  locale: string;
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
    this.namespace = formatDiagnosticValue(params.namespace);
    this.key = formatDiagnosticValue(params.key);
    this.locale = formatDiagnosticValue(params.locale);
    this.issues = [...params.issues];
  }
}

function formatDiagnosticField(
  field: TranslationDocumentIdentifierField,
  value: unknown,
): string {
  const diagnosticValue = formatDiagnosticValue(value);
  return typeof value === 'string'
    ? `${field}=${JSON.stringify(diagnosticValue)}`
    : `${field}=${diagnosticValue}`;
}

function formatDiagnosticValue(value: unknown): string {
  if (value === undefined) {
    return '<missing>';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  return `<invalid:${typeof value}>`;
}
