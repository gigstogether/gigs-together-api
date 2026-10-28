import { isRecord } from '../../shared/utils/is-record';
import {
  isValidTranslationKey,
  isValidTranslationNamespace,
} from './translation-identifiers';
import type {
  TranslationBundleEntry,
  TranslationFormat,
  TranslationKind,
  TranslationRecord,
} from './types/translation.types';

export type TranslationRecordField =
  | 'record'
  | 'locale'
  | 'namespace'
  | 'key'
  | 'value'
  | 'format'
  | 'kind'
  | 'isActive';

export interface TranslationRecordValidationIssue {
  field: TranslationRecordField;
  reason: string;
}

interface InvalidTranslationRecordErrorParams {
  issues: readonly TranslationRecordValidationIssue[];
}

interface ValidField<T> {
  isValid: true;
  value: T;
}

interface InvalidField {
  isValid: false;
  issue: TranslationRecordValidationIssue;
}

type FieldValidationResult<T> = ValidField<T> | InvalidField;

export class InvalidTranslationRecordError extends Error {
  issues: readonly TranslationRecordValidationIssue[];

  constructor(params: InvalidTranslationRecordErrorParams) {
    const details = params.issues
      .map((issue) => `${issue.field} ${issue.reason}`)
      .join('; ');

    super(`Invalid translation record: ${details}.`);
    this.name = InvalidTranslationRecordError.name;
    this.issues = [...params.issues];
  }
}

export function parseTranslationRecord(value: unknown): TranslationRecord {
  if (!isRecord(value)) {
    throw new InvalidTranslationRecordError({
      issues: [{ field: 'record', reason: 'must be an object' }],
    });
  }

  const locale = validateRequiredString('locale', value.locale);
  const namespace = validateIdentifier('namespace', value.namespace);
  const key = validateIdentifier('key', value.key);
  const entryValue = validateRequiredString('value', value.value);
  const format = validateFormat(value.format);
  const kind = validateKind(value.kind);
  const isActive = validateBoolean('isActive', value.isActive);
  const results = [locale, namespace, key, entryValue, format, kind, isActive];
  const issues = results.flatMap((result) =>
    result.isValid ? [] : [result.issue],
  );

  if (
    !locale.isValid ||
    !namespace.isValid ||
    !key.isValid ||
    !entryValue.isValid ||
    !format.isValid ||
    !kind.isValid ||
    !isActive.isValid
  ) {
    throw new InvalidTranslationRecordError({ issues });
  }

  return {
    locale: locale.value.toLowerCase(),
    namespace: namespace.value,
    key: key.value,
    value: entryValue.value,
    format: format.value,
    kind: kind.value,
    isActive: isActive.value,
  };
}

export function parseTranslationBundleEntry(
  value: unknown,
): TranslationBundleEntry {
  if (!isRecord(value)) {
    return toTranslationBundleEntry(parseTranslationRecord(value));
  }

  return toTranslationBundleEntry(
    parseTranslationRecord({ ...value, locale: 'en' }),
  );
}

function toTranslationBundleEntry(
  record: TranslationRecord,
): TranslationBundleEntry {
  return {
    namespace: record.namespace,
    key: record.key,
    value: record.value,
    format: record.format,
    kind: record.kind,
    isActive: record.isActive,
  };
}

function validateRequiredString(
  field: 'locale' | 'value',
  value: unknown,
): FieldValidationResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalidField(field, 'must be a non-empty string');
  }

  return {
    isValid: true,
    value: field === 'value' ? value : value.trim(),
  };
}

function validateIdentifier(
  field: 'namespace' | 'key',
  value: unknown,
): FieldValidationResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalidField(field, 'must be a non-empty string');
  }

  const normalized = value.trim();
  const isValid =
    field === 'namespace'
      ? isValidTranslationNamespace(normalized)
      : isValidTranslationKey(normalized);

  if (!isValid) {
    const reason =
      field === 'namespace'
        ? 'must be a valid camelCase translation namespace'
        : 'must be a valid dot-separated camelCase translation key';
    return invalidField(field, reason);
  }

  return { isValid: true, value: normalized };
}

function validateFormat(
  value: unknown,
): FieldValidationResult<TranslationFormat> {
  if (value !== 'plain' && value !== 'icu') {
    return invalidField('format', 'must be one of "plain" or "icu"');
  }

  return { isValid: true, value };
}

function validateKind(value: unknown): FieldValidationResult<TranslationKind> {
  if (value !== 'text' && value !== 'template') {
    return invalidField('kind', 'must be one of "text" or "template"');
  }

  return { isValid: true, value };
}

function validateBoolean(
  field: 'isActive',
  value: unknown,
): FieldValidationResult<boolean> {
  if (typeof value !== 'boolean') {
    return invalidField(field, 'must be a boolean');
  }

  return { isValid: true, value };
}

function invalidField(
  field: TranslationRecordField,
  reason: string,
): InvalidField {
  return { isValid: false, issue: { field, reason } };
}
