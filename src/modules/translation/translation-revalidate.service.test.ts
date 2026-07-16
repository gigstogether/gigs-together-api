import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationRevalidateService } from './translation-revalidate.service';

describe('TranslationRevalidateService', () => {
  let service: TranslationRevalidateService;

  const revalidateNamespaceMock = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('APP_BASE_URL', '');
    vi.stubEnv('TRANSLATIONS_REVALIDATE_SECRET', '');
    revalidateNamespaceMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationRevalidateService,
        {
          provide: TranslationCacheService,
          useValue: {
            revalidateNamespace: revalidateNamespaceMock,
          },
        },
      ],
    }).compile();

    service = module.get<TranslationRevalidateService>(
      TranslationRevalidateService,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
      vi.stubEnv('APP_BASE_URL', 'https://gigs.example');
      vi.stubEnv('TRANSLATIONS_REVALIDATE_SECRET', 'secret');
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
});
