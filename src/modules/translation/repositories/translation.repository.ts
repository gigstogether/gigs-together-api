import type { TranslationRecord } from '../types/translation.types';

export const TRANSLATION_REPOSITORY = Symbol('TRANSLATION_REPOSITORY');

export interface FindActiveByNamespaceParams {
  readonly namespace: string;
}

export interface TranslationRepository {
  findActiveByNamespace(
    params: FindActiveByNamespaceParams,
  ): Promise<readonly TranslationRecord[]>;

  findAllActiveRecords(): Promise<readonly TranslationRecord[]>;
}
