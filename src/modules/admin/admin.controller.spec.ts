import { AdminController } from './admin.controller';
import type { AdminDashboardService } from './admin-dashboard.service';
import type { AdminGigService } from './admin-gig.service';
import type { GigModerationService } from '../gig/gig-moderation.service';
import type { LocaleService } from '../locale/locale.service';
import type { TranslationCacheService } from '../translation/translation-cache.service';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

describe('AdminController', () => {
  const adminDashboardService = {
    getDashboard: vi.fn().mockResolvedValue({
      summary: {
        pendingGigsCount: 3,
        publishedGigsCount: 12,
      },
    }),
  } satisfies Pick<AdminDashboardService, 'getDashboard'>;

  const adminGigService = {
    getGigsList: vi.fn().mockResolvedValue({ gigs: [] }),
    getGigByPublicId: vi.fn().mockResolvedValue({
      publicId: 'gig-42',
      title: 'Radiohead',
    }),
  } satisfies Pick<AdminGigService, 'getGigsList' | 'getGigByPublicId'>;

  const gigModerationService = {
    approveGig: vi.fn().mockResolvedValue(undefined),
    rejectGig: vi.fn().mockResolvedValue(undefined),
    publishGigPost: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<
    GigModerationService,
    'approveGig' | 'rejectGig' | 'publishGigPost'
  >;

  const localeService = {
    getAllLocalesOrdered: vi
      .fn()
      .mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]),
    updateLocaleByIso: vi.fn().mockResolvedValue({
      iso: 'en',
      nativeName: 'English',
      isActive: false,
      order: 0,
    }),
    updateLocalesOrder: vi.fn().mockResolvedValue([
      { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
      { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
    ]),
  } satisfies Pick<
    LocaleService,
    'getAllLocalesOrdered' | 'updateLocaleByIso' | 'updateLocalesOrder'
  >;

  const authorizationService = {
    refreshAdminsCache: vi.fn(),
  };

  const configService = {
    get: vi.fn().mockReturnValue('secret'),
  };

  const translationCacheService = {
    revalidateNamespace: vi.fn(),
  } satisfies Pick<TranslationCacheService, 'revalidateNamespace'>;

  const controller = new AdminController(
    adminDashboardService as unknown as AdminDashboardService,
    adminGigService as unknown as AdminGigService,
    authorizationService as never,
    configService as never,
    localeService as unknown as LocaleService,
    gigModerationService as unknown as GigModerationService,
    translationCacheService as unknown as TranslationCacheService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockReturnValue('secret');
  });

  describe('getDashboard', () => {
    it('should return dashboard summary counts from admin dashboard service', async () => {
      await expect(controller.getDashboard()).resolves.toEqual({
        summary: {
          pendingGigsCount: 3,
          publishedGigsCount: 12,
        },
      });
    });
  });

  describe('getGigs', () => {
    it('should return gigs list from admin gig service', async () => {
      await expect(
        controller.getGigs({ status: 'pending', limit: 20 }),
      ).resolves.toEqual({ gigs: [] });

      expect(adminGigService.getGigsList).toHaveBeenCalledWith({
        status: 'pending',
        limit: 20,
      });
    });
  });

  describe('getGigByPublicId', () => {
    it('should return gig by public id from admin gig service', async () => {
      await expect(
        controller.getGigByPublicId({ publicId: 'gig-42' }),
      ).resolves.toEqual({
        publicId: 'gig-42',
        title: 'Radiohead',
      });

      expect(adminGigService.getGigByPublicId).toHaveBeenCalledWith('gig-42');
    });
  });

  describe('approveGigByPublicId', () => {
    it('should approve gig via gig moderation service', async () => {
      await expect(
        controller.approveGigByPublicId({ publicId: 'gig-42' }),
      ).resolves.toBeUndefined();

      expect(gigModerationService.approveGig).toHaveBeenCalledWith({
        publicId: 'gig-42',
      });
    });
  });

  describe('rejectGigByPublicId', () => {
    it('should reject gig via gig moderation service', async () => {
      await expect(
        controller.rejectGigByPublicId({ publicId: 'gig-42' }),
      ).resolves.toBeUndefined();

      expect(gigModerationService.rejectGig).toHaveBeenCalledWith({
        publicId: 'gig-42',
      });
    });
  });

  describe('publishGigPostByPublicId', () => {
    it('should publish main telegram post via gig moderation service', async () => {
      await expect(
        controller.publishGigPostByPublicId({ publicId: 'gig-42' }),
      ).resolves.toBeUndefined();

      expect(gigModerationService.publishGigPost).toHaveBeenCalledWith({
        publicId: 'gig-42',
      });
    });
  });

  describe('getLocales', () => {
    it('should return locales from locale service', async () => {
      await expect(controller.getLocales()).resolves.toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]);
      expect(localeService.getAllLocalesOrdered).toHaveBeenCalled();
    });
  });

  describe('patchLocale', () => {
    it('should update locale via locale service', async () => {
      await expect(
        controller.patchLocale('en', { isActive: false }),
      ).resolves.toEqual({
        iso: 'en',
        nativeName: 'English',
        isActive: false,
        order: 0,
      });

      expect(localeService.updateLocaleByIso).toHaveBeenCalledWith({
        iso: 'en',
        isActive: false,
      });
    });
  });

  describe('patchLocalesOrder', () => {
    it('should batch update locale order via locale service', async () => {
      await expect(
        controller.patchLocalesOrder({
          locales: [
            { iso: 'es', order: 0 },
            { iso: 'en', order: 1 },
          ],
        }),
      ).resolves.toEqual([
        { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
        { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
      ]);

      expect(localeService.updateLocalesOrder).toHaveBeenCalledWith({
        locales: [
          { iso: 'es', order: 0 },
          { iso: 'en', order: 1 },
        ],
      });
    });
  });

  describe('revalidateAdmins', () => {
    it('should refresh admins cache when secret is valid', async () => {
      await expect(
        controller.revalidateAdmins('secret'),
      ).resolves.toBeUndefined();

      expect(authorizationService.refreshAdminsCache).toHaveBeenCalledTimes(1);
    });

    it('should throw when secret header is invalid', async () => {
      await expect(controller.revalidateAdmins('wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('should throw when admin revalidate secret is not configured', async () => {
      configService.get.mockReturnValue('');

      await expect(
        controller.revalidateAdmins('secret'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('revalidateTranslations', () => {
    it('should revalidate translation namespace when secret is valid', async () => {
      await expect(
        controller.revalidateTranslations('secret', { namespace: 'telegram' }),
      ).resolves.toBeUndefined();

      expect(translationCacheService.revalidateNamespace).toHaveBeenCalledWith({
        namespace: 'telegram',
      });
    });

    it('should throw when secret header is invalid', async () => {
      await expect(
        controller.revalidateTranslations('wrong', { namespace: 'telegram' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw when namespace is invalid', async () => {
      translationCacheService.revalidateNamespace.mockRejectedValue(
        new BadRequestException('Invalid translation namespace "$invalid".'),
      );

      await expect(
        controller.revalidateTranslations('secret', {
          namespace: '$invalid',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
