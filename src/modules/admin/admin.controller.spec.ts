import { AdminController } from './admin.controller';
import type { AdminDashboardService } from './admin-dashboard.service';
import type { AdminGigService } from './admin-gig.service';
import type { FeedRevalidateService } from '../gig/feed-revalidate.service';
import type { GigModerationService } from '../gig/gig-moderation.service';
import type { DigestService } from '../digest/digest.service';
import type { LocaleService } from '../locale/locale.service';
import type { TranslationRevalidateService } from '../translation/translation-revalidate.service';
import type { TranslationService } from '../translation/translation.service';
import type { AdminGigCandidateService } from './admin-gig-candidate.service';

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

  const translationService = {
    listDistinctNamespaces: vi.fn().mockResolvedValue(['about', 'country']),
    listRecords: vi.fn().mockResolvedValue([
      {
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About',
        format: 'plain',
        kind: 'text',
        isActive: true,
      },
    ]),
    upsertRecord: vi.fn().mockResolvedValue({
      id: '64f1a2b3c4d5e6f7a8b9c0d1',
      namespace: 'about',
      locale: 'en',
      key: 'title',
      value: 'About us',
      format: 'plain',
      kind: 'text',
      isActive: true,
    }),
    setActiveById: vi.fn().mockResolvedValue({
      id: '64f1a2b3c4d5e6f7a8b9c0d1',
      namespace: 'about',
      locale: 'en',
      key: 'title',
      value: 'About',
      format: 'plain',
      kind: 'text',
      isActive: false,
    }),
  } satisfies Pick<
    TranslationService,
    'listDistinctNamespaces' | 'listRecords' | 'upsertRecord' | 'setActiveById'
  >;

  const translationRevalidateService = {
    revalidateAll: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<TranslationRevalidateService, 'revalidateAll'>;

  const feedRevalidateService = {
    revalidateFeed: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<FeedRevalidateService, 'revalidateFeed'>;

  const digestService = {
    publish: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<DigestService, 'publish'>;

  const adminGigCandidateService = {
    getList: vi.fn().mockResolvedValue({ gigCandidates: [] }),
    getById: vi.fn().mockResolvedValue({
      id: '507f1f77bcf86cd799439099',
      title: 'Band',
    }),
  } satisfies Pick<AdminGigCandidateService, 'getList' | 'getById'>;

  const controller = new AdminController(
    adminDashboardService as unknown as AdminDashboardService,
    adminGigService as unknown as AdminGigService,
    localeService as unknown as LocaleService,
    translationService as unknown as TranslationService,
    translationRevalidateService as unknown as TranslationRevalidateService,
    gigModerationService as unknown as GigModerationService,
    feedRevalidateService as unknown as FeedRevalidateService,
    digestService as unknown as DigestService,
    adminGigCandidateService as unknown as AdminGigCandidateService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('getGigCandidates', () => {
    it('should return gig candidates from admin gig candidate service', async () => {
      const query = { status: 'pending' as const, limit: 20 };

      await expect(controller.getGigCandidates(query)).resolves.toEqual({
        gigCandidates: [],
      });
      expect(adminGigCandidateService.getList).toHaveBeenCalledWith(query);
    });
  });

  describe('getGigCandidateById', () => {
    it('should return a gig candidate by id', async () => {
      const id = '507f1f77bcf86cd799439099';

      await expect(controller.getGigCandidateById(id)).resolves.toEqual({
        id,
        title: 'Band',
      });
      expect(adminGigCandidateService.getById).toHaveBeenCalledWith(id);
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

  describe('publishDigest', () => {
    it('should publish weekly digest via digest service', async () => {
      await expect(controller.publishDigest()).resolves.toBeUndefined();

      expect(digestService.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('revalidateFeed', () => {
    it('should revalidate all feed paths via feed revalidate service', async () => {
      await expect(controller.revalidateFeed()).resolves.toBeUndefined();

      expect(feedRevalidateService.revalidateFeed).toHaveBeenCalledWith({});
    });
  });

  describe('revalidateTranslations', () => {
    it('should revalidate all translation caches via translation revalidate service', async () => {
      await expect(
        controller.revalidateTranslations(),
      ).resolves.toBeUndefined();

      expect(translationRevalidateService.revalidateAll).toHaveBeenCalledTimes(
        1,
      );
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

  describe('getTranslationNamespaces', () => {
    it('should return translation namespaces from translation service', async () => {
      await expect(controller.getTranslationNamespaces()).resolves.toEqual({
        namespaces: ['about', 'country'],
      });

      expect(translationService.listDistinctNamespaces).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('getTranslations', () => {
    it('should return all translations when namespace is omitted', async () => {
      await expect(controller.getTranslations({})).resolves.toEqual({
        records: [
          {
            id: '64f1a2b3c4d5e6f7a8b9c0d1',
            namespace: 'about',
            locale: 'en',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ],
      });

      expect(translationService.listRecords).toHaveBeenCalledWith({
        namespace: undefined,
        locale: undefined,
      });
    });

    it('should return translations list from translation service', async () => {
      await expect(
        controller.getTranslations({ namespace: 'about', locale: 'en' }),
      ).resolves.toEqual({
        records: [
          {
            id: '64f1a2b3c4d5e6f7a8b9c0d1',
            namespace: 'about',
            locale: 'en',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ],
      });

      expect(translationService.listRecords).toHaveBeenCalledWith({
        namespace: 'about',
        locale: 'en',
      });
    });
  });

  describe('upsertTranslation', () => {
    it('should upsert translation via translation service', async () => {
      await expect(
        controller.upsertTranslation({
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).resolves.toEqual({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      });

      expect(translationService.upsertRecord).toHaveBeenCalledWith({
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      });
    });
  });

  describe('patchTranslationActive', () => {
    it('should toggle translation active flag via translation service', async () => {
      await expect(
        controller.patchTranslationActive('64f1a2b3c4d5e6f7a8b9c0d1', {
          isActive: false,
        }),
      ).resolves.toEqual({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About',
        format: 'plain',
        kind: 'text',
        isActive: false,
      });

      expect(translationService.setActiveById).toHaveBeenCalledWith({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        isActive: false,
      });
    });
  });
});
