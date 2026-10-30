import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationRevalidateService } from './translation-revalidate.service';

describe('TranslationRevalidateService', () => {
  let service: TranslationRevalidateService;

  const revalidateNamespaceMock = vi.fn();
  const revalidateAllMock = vi.fn();
  const listNamespacesMock = vi.fn();
  const fetchMock = vi.fn();

  async function createService(
    config: Record<string, unknown> = {},
  ): Promise<TranslationRevalidateService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationRevalidateService,
        {
          provide: TranslationCacheService,
          useValue: {
            revalidateNamespace: revalidateNamespaceMock,
            revalidateAll: revalidateAllMock,
            listNamespaces: listNamespacesMock,
          },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            APP_BASE_URL: '',
            TRANSLATIONS_REVALIDATE_SECRET: '',
            ...config,
          }),
        },
      ],
    }).compile();

    return module.get(TranslationRevalidateService);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    revalidateNamespaceMock.mockResolvedValue(undefined);
    revalidateAllMock.mockResolvedValue(undefined);
    listNamespacesMock.mockReturnValue([]);
    service = await createService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('revalidateAfterWrite', () => {
    it('should revalidate API translation cache when write completes', async () => {
      await service.revalidateAfterWrite({ namespace: 'about' });

      expect(revalidateNamespaceMock).toHaveBeenCalledWith({
        namespace: 'about',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should POST front translation revalidate request when env is configured', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        TRANSLATIONS_REVALIDATE_SECRET: 'secret',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateAfterWrite({ namespace: 'about' });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://gigs.example/api/revalidate/translations',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-translations-revalidate-secret': 'secret',
          },
          body: JSON.stringify({ namespace: 'about' }),
        },
      );
    });

    it('should skip front revalidate request when env is not configured', async () => {
      await service.revalidateAfterWrite({ namespace: 'country' });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('revalidateAll', () => {
    it('should reload full API cache and skip front requests when env is not configured', async () => {
      listNamespacesMock.mockReturnValue(['about', 'common']);

      await service.revalidateAll();

      expect(revalidateAllMock).toHaveBeenCalledOnce();
      expect(listNamespacesMock).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should POST front revalidate for each cached namespace when env is configured', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        TRANSLATIONS_REVALIDATE_SECRET: 'secret',
      });
      listNamespacesMock.mockReturnValue(['about', 'common']);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateAll();

      expect(revalidateAllMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://gigs.example/api/revalidate/translations',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-translations-revalidate-secret': 'secret',
          },
          body: JSON.stringify({ namespace: 'about' }),
        },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'https://gigs.example/api/revalidate/translations',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-translations-revalidate-secret': 'secret',
          },
          body: JSON.stringify({ namespace: 'common' }),
        },
      );
    });
  });
});
