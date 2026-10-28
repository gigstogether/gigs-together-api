interface MissingTranslationErrorParams {
  namespace: string;
  key: string;
  locale: string;
}

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
