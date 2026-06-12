import { AdminController } from './admin.controller';
import type { AdminDashboardService } from './admin-dashboard.service';
import type { AdminGigService } from './admin-gig.service';
import type { LanguageService } from '../language/language.service';

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

  const languageService = {
    getAllLanguagesOrdered: vi
      .fn()
      .mockResolvedValue([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
      ]),
    updateLanguageByIso: vi.fn().mockResolvedValue({
      iso: 'en',
      name: 'English',
      isActive: false,
      order: 0,
    }),
    updateLanguagesOrder: vi.fn().mockResolvedValue([
      { iso: 'es', name: 'Español', isActive: true, order: 0 },
      { iso: 'en', name: 'English', isActive: true, order: 1 },
    ]),
  } satisfies Pick<
    LanguageService,
    'getAllLanguagesOrdered' | 'updateLanguageByIso' | 'updateLanguagesOrder'
  >;

  const authorizationService = {
    refreshAdminsCache: vi.fn(),
  };

  const configService = {
    get: vi.fn().mockReturnValue('secret'),
  };

  const controller = new AdminController(
    adminDashboardService as unknown as AdminDashboardService,
    adminGigService as unknown as AdminGigService,
    authorizationService as never,
    configService as never,
    languageService as unknown as LanguageService,
  );

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

  describe('getLanguages', () => {
    it('should return languages from language service', async () => {
      await expect(controller.getLanguages()).resolves.toEqual([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
      ]);
      expect(languageService.getAllLanguagesOrdered).toHaveBeenCalled();
    });
  });

  describe('patchLanguage', () => {
    it('should update language via language service', async () => {
      await expect(
        controller.patchLanguage('en', { isActive: false }),
      ).resolves.toEqual({
        iso: 'en',
        name: 'English',
        isActive: false,
        order: 0,
      });

      expect(languageService.updateLanguageByIso).toHaveBeenCalledWith({
        iso: 'en',
        isActive: false,
      });
    });
  });

  describe('patchLanguagesOrder', () => {
    it('should batch update language order via language service', async () => {
      await expect(
        controller.patchLanguagesOrder({
          languages: [
            { iso: 'es', order: 0 },
            { iso: 'en', order: 1 },
          ],
        }),
      ).resolves.toEqual([
        { iso: 'es', name: 'Español', isActive: true, order: 0 },
        { iso: 'en', name: 'English', isActive: true, order: 1 },
      ]);

      expect(languageService.updateLanguagesOrder).toHaveBeenCalledWith({
        languages: [
          { iso: 'es', order: 0 },
          { iso: 'en', order: 1 },
        ],
      });
    });
  });
});
