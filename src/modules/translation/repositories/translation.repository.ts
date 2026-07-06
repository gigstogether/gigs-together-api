import type {
  TranslationEntry,
  TranslationRecord,
} from '../types/translation.types';

export const TRANSLATION_REPOSITORY = Symbol('TRANSLATION_REPOSITORY');

export interface FindActiveTranslationsParams {
  readonly locale: string;
  readonly namespaces?: readonly string[];
}

export interface FindActiveByNamespaceParams {
  readonly namespace: string;
}

export interface TranslationRepository {
  findActiveTranslations(
    params: FindActiveTranslationsParams,
  ): Promise<readonly TranslationEntry[]>;

  findActiveByNamespace(
    params: FindActiveByNamespaceParams,
  ): Promise<readonly TranslationRecord[]>;
}
