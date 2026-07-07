import { TranslationRepositoryMapper } from './translation.repository.mapper';

describe('TranslationRepositoryMapper', () => {
  describe('toTranslationEntry', () => {
    it('should map a lean document to TranslationEntry', () => {
      expect(
        TranslationRepositoryMapper.toTranslationEntry({
          key: 'hello',
          value: 'Hello',
          namespace: 'home',
          format: 'plain',
          kind: 'text',
        }),
      ).toEqual({
        key: 'hello',
        value: 'Hello',
        namespace: 'home',
        format: 'plain',
        kind: 'text',
      });
    });

    it('should default missing kind to text', () => {
      expect(
        TranslationRepositoryMapper.toTranslationEntry({
          key: 'hello',
          value: 'Hello',
          namespace: 'home',
          format: 'plain',
        }),
      ).toEqual({
        key: 'hello',
        value: 'Hello',
        format: 'plain',
        kind: 'text',
      });
    });
  });

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
});
