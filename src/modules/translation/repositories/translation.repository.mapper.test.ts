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
});
