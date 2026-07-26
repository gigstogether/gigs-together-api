import type {
  TranslationRecordPlainFormat,
  StoredTranslationRecord,
} from '../types/translation-record.types';
import type {
  TranslationRecord,
  TranslationKind,
} from '../types/translation.types';

export const TRANSLATION_REPOSITORY = Symbol('TRANSLATION_REPOSITORY');

export interface FindActiveByNamespaceParams {
  readonly namespace: string;
}

export interface FindByNamespaceParams {
  readonly namespace: string;
  readonly locale?: string;
}

export interface FindAllTranslationsParams {
  readonly locale?: string;
}

export interface UpsertTranslationRecordParams {
  readonly namespace: string;
  readonly locale: string;
  readonly key: string;
  readonly value: string;
  readonly format: TranslationRecordPlainFormat;
  readonly kind: TranslationKind;
  readonly isActive: boolean;
}

export interface SetTranslationActiveByIdParams {
  readonly id: string;
  readonly isActive: boolean;
}

export interface TranslationRepository {
  findActiveByNamespace(
    params: FindActiveByNamespaceParams,
  ): Promise<readonly TranslationRecord[]>;

  findAllActiveRecords(): Promise<readonly TranslationRecord[]>;

  findByNamespace(
    params: FindByNamespaceParams,
  ): Promise<readonly StoredTranslationRecord[]>;

  findAll(
    params: FindAllTranslationsParams,
  ): Promise<readonly StoredTranslationRecord[]>;

  listDistinctNamespaces(): Promise<readonly string[]>;

  upsertRecord(
    params: UpsertTranslationRecordParams,
  ): Promise<StoredTranslationRecord>;

  setActiveById(
    params: SetTranslationActiveByIdParams,
  ): Promise<StoredTranslationRecord | null>;
}
