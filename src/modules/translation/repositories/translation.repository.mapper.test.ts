import {
  InvalidTranslationDocumentError,
  TranslationRepositoryMapper,
} from './translation.repository.mapper';

describe('TranslationRepositoryMapper', () => {
  describe('toTranslationRecord', () => {
    it('should map a lean document to TranslationRecord with normalized locale', () => {
      expect(
        TranslationRepositoryMapper.toTranslationRecord({
          _id: '64f1a2b3c4d5e6f7a8b9c0d0',
          locale: ' EN ',
          namespace: 'telegram',
          key: 'weeklyDigest.empty',
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

    it('should throw a diagnostic error with the document id when locale is missing', () => {
      expect(() =>
        TranslationRepositoryMapper.toTranslationRecord({
          _id: '64f1a2b3c4d5e6f7a8b9c0d0',
          namespace: 'telegram',
          key: 'weeklyDigest.empty',
          value: 'There are no gigs scheduled for this week.',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).toThrow(
        new InvalidTranslationDocumentError({
          documentId: '64f1a2b3c4d5e6f7a8b9c0d0',
          locale: undefined,
          namespace: 'telegram',
          key: 'weeklyDigest.empty',
          issues: [
            {
              field: 'locale',
              reason: 'must be a non-empty string',
            },
          ],
        }),
      );
    });
  });

  describe('toStoredTranslationRecord', () => {
    it('should map a lean document with id to StoredTranslationRecord', () => {
      expect(
        TranslationRepositoryMapper.toStoredTranslationRecord({
          _id: '64f1a2b3c4d5e6f7a8b9c0d1',
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).toEqual({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        locale: 'en',
        namespace: 'about',
        key: 'title',
        value: 'About',
        format: 'plain',
        kind: 'text',
        isActive: true,
      });
    });
  });
});
