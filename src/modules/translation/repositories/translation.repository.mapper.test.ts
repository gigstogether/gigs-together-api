import { TranslationRepositoryMapper } from './translation.repository.mapper';

describe('TranslationRepositoryMapper', () => {
  describe('toTranslationRecord', () => {
    it('should map a lean document to TranslationRecord with normalized locale', () => {
      expect(
        TranslationRepositoryMapper.toTranslationRecord({
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
