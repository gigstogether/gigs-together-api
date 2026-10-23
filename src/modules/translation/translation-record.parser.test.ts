import {
  InvalidTranslationRecordError,
  parseTranslationRecord,
} from './translation-record.parser';

function getValidationError(value: unknown): InvalidTranslationRecordError {
  try {
    parseTranslationRecord(value);
  } catch (e) {
    if (e instanceof InvalidTranslationRecordError) {
      return e;
    }

    throw e;
  }

  throw new Error('Expected translation record validation to fail.');
}

describe('parseTranslationRecord', () => {
  it('should normalize and return a valid translation record', () => {
    expect(
      parseTranslationRecord({
        locale: ' EN ',
        namespace: ' telegram ',
        key: ' weeklyDigest.empty ',
        value: 'There are no gigs scheduled for this week.',
        format: 'plain',
        kind: 'text',
        isActive: true,
      }),
    ).toEqual({
      locale: 'en',
      namespace: 'telegram',
      key: 'weeklyDigest.empty',
      value: 'There are no gigs scheduled for this week.',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });
  });

  it('should report every missing required field in one error', () => {
    const error = getValidationError({});

    expect(error.issues).toEqual([
      { field: 'locale', reason: 'must be a non-empty string' },
      { field: 'namespace', reason: 'must be a non-empty string' },
      { field: 'key', reason: 'must be a non-empty string' },
      { field: 'value', reason: 'must be a non-empty string' },
      { field: 'format', reason: 'must be one of "plain" or "icu"' },
      { field: 'kind', reason: 'must be one of "text" or "template"' },
      { field: 'isActive', reason: 'must be a boolean' },
    ]);
  });

  it('should report every invalid present field in one error', () => {
    const error = getValidationError({
      locale: 'en',
      namespace: 'Bad_namespace',
      key: 'bad_key',
      value: '  ',
      format: 'html',
      kind: 'label',
      isActive: 'yes',
    });

    expect(error.issues).toEqual([
      {
        field: 'namespace',
        reason: 'must be a valid camelCase translation namespace',
      },
      {
        field: 'key',
        reason: 'must be a valid dot-separated camelCase translation key',
      },
      { field: 'value', reason: 'must be a non-empty string' },
      { field: 'format', reason: 'must be one of "plain" or "icu"' },
      { field: 'kind', reason: 'must be one of "text" or "template"' },
      { field: 'isActive', reason: 'must be a boolean' },
    ]);
  });

  it('should reject a value that is not an object', () => {
    const error = getValidationError(null);

    expect(error.issues).toEqual([
      { field: 'record', reason: 'must be an object' },
    ]);
  });
});
