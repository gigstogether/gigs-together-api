import { LocaleRepositoryMapper } from './locale.repository.mapper';

describe('LocaleRepositoryMapper', () => {
  describe('toSupportedLocale', () => {
    it('should map a lean document to SupportedLocale with normalized iso', () => {
      expect(
        LocaleRepositoryMapper.toSupportedLocale({
          iso: ' EN ',
          nativeName: 'English',
          isActive: true,
          order: 0,
        }),
      ).toEqual({
        iso: 'en',
        nativeName: 'English',
        isActive: true,
        order: 0,
      });
    });
  });

  describe('toActiveSupportedLocales', () => {
    it('should filter out locales with empty normalized iso', () => {
      expect(
        LocaleRepositoryMapper.toActiveSupportedLocales([
          { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
          { iso: '  ', nativeName: 'Invalid', isActive: true, order: 1 },
        ]),
      ).toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]);
    });
  });
});
