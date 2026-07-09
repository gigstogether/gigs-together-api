import type { AuthorizationService } from '../auth/authorization.service';
import type { LocaleService } from '../locale/locale.service';
import type { TranslationCacheService } from '../translation/translation-cache.service';
import { InternalController } from './internal.controller';

describe('InternalController', () => {
  const authorizationService = {
    refreshAdminsCache: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<AuthorizationService, 'refreshAdminsCache'>;

  const localeService = {
    revalidateActiveLocalesCache: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<LocaleService, 'revalidateActiveLocalesCache'>;

  const translationCacheService = {
    revalidateNamespace: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<TranslationCacheService, 'revalidateNamespace'>;

  const controller = new InternalController(
    authorizationService as unknown as AuthorizationService,
    localeService as unknown as LocaleService,
    translationCacheService as unknown as TranslationCacheService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('revalidateAdminsCache', () => {
    it('should refresh admins cache via authorization service', async () => {
      await expect(controller.revalidateAdminsCache()).resolves.toBeUndefined();

      expect(authorizationService.refreshAdminsCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('revalidateLocalesCache', () => {
    it('should revalidate active locales cache via locale service', async () => {
      await expect(
        controller.revalidateLocalesCache(),
      ).resolves.toBeUndefined();

      expect(localeService.revalidateActiveLocalesCache).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('revalidateTranslationsCache', () => {
    it('should revalidate translation namespace via translation cache service', async () => {
      await expect(
        controller.revalidateTranslationsCache({ namespace: 'telegram' }),
      ).resolves.toBeUndefined();

      expect(translationCacheService.revalidateNamespace).toHaveBeenCalledWith({
        namespace: 'telegram',
      });
    });
  });
});
