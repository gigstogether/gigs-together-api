import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LocaleService } from '../locale/locale.service';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';
import { TranslationCacheService } from './translation-cache.service';
import { TRANSLATION_CACHE_DEFAULT_TTL_MS } from './types/translation-cache.types';

describe('TranslationCacheService', () => {
  let service: TranslationCacheService;
  let translationRepository: TranslationRepository;

  const getActiveLocaleIsosMock = vi.fn();
  const findAllActiveRecordsMock = vi.fn();
  const findActiveByNamespaceMock = vi.fn();
  const addIntervalMock = vi.fn();
  const deleteIntervalMock = vi.fn();

  beforeEach(async () => {
    getActiveLocaleIsosMock.mockReset();
    findAllActiveRecordsMock.mockReset();
    findActiveByNamespaceMock.mockReset();
    addIntervalMock.mockReset();
    deleteIntervalMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationCacheService,
        {
          provide: TRANSLATION_REPOSITORY,
          useValue: {
            findAllActiveRecords: findAllActiveRecordsMock,
            findActiveByNamespace: findActiveByNamespaceMock,
          },
        },
        {
          provide: LocaleService,
          useValue: {
            getActiveLocaleIsos: getActiveLocaleIsosMock,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(undefined),
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: {
            addInterval: addIntervalMock,
            deleteInterval: deleteIntervalMock,
          },
        },
      ],
    }).compile();

    service = module.get<TranslationCacheService>(TranslationCacheService);
    translationRepository = module.get<TranslationRepository>(
      TRANSLATION_REPOSITORY,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('onModuleInit', () => {
    it('should warm up cache from all active records and register TTL interval', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en', 'es']);

      await service.onModuleInit();

      expect(translationRepository.findAllActiveRecords).toHaveBeenCalledTimes(
        1,
      );
      expect(addIntervalMock).toHaveBeenCalledTimes(1);
      expect(
        service.getEntry({
          namespace: 'about',
          key: 'title',
          locale: 'en',
        }).value,
      ).toBe('About');
    });

    it('should throw when warm-up fails', async () => {
      findAllActiveRecordsMock.mockRejectedValue(new Error('mongo down'));
      getActiveLocaleIsosMock.mockResolvedValue(['en']);

      await expect(service.onModuleInit()).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error && error.message === 'mongo down',
      );
      expect(addIntervalMock).not.toHaveBeenCalled();
    });
  });

  describe('TTL full reload', () => {
    it('should refresh cache when scheduled reload succeeds', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);

      vi.useFakeTimers();
      await service.onModuleInit();

      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'Updated about',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      await vi.advanceTimersByTimeAsync(TRANSLATION_CACHE_DEFAULT_TTL_MS);
      await vi.runOnlyPendingTimersAsync();

      expect(
        service.getEntry({
          namespace: 'about',
          key: 'title',
          locale: 'en',
        }).value,
      ).toBe('Updated about');
      expect(findAllActiveRecordsMock.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    });

    it('should keep stale cache when scheduled reload fails', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);

      vi.useFakeTimers();
      await service.onModuleInit();

      findAllActiveRecordsMock.mockRejectedValue(new Error('mongo down'));
      await vi.advanceTimersByTimeAsync(TRANSLATION_CACHE_DEFAULT_TTL_MS);
      await vi.runOnlyPendingTimersAsync();

      expect(
        service.getEntry({
          namespace: 'about',
          key: 'title',
          locale: 'en',
        }).value,
      ).toBe('About');
    });
  });

  describe('resolveLocale', () => {
    it('should resolve supported locale from cache without reloading active locales', async () => {
      findAllActiveRecordsMock.mockResolvedValue([]);
      getActiveLocaleIsosMock.mockResolvedValue(['en', 'es']);

      await service.onModuleInit();

      expect(service.resolveLocale('es-ES,es;q=0.9')).toBe('es');
      expect(getActiveLocaleIsosMock).toHaveBeenCalledTimes(1);
      expect(service.resolveLocale('es')).toBe('es');
      expect(getActiveLocaleIsosMock).toHaveBeenCalledTimes(1);
    });

    it('should fallback to default locale when accept-language is unsupported', async () => {
      findAllActiveRecordsMock.mockResolvedValue([]);
      getActiveLocaleIsosMock.mockResolvedValue(['es']);

      await service.onModuleInit();

      expect(service.resolveLocale('fr-FR')).toBe('en');
    });
  });

  describe('revalidateNamespace', () => {
    it('should reload only the requested namespace slice', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);
      await service.onModuleInit();

      findActiveByNamespaceMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'Updated about',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);

      await service.revalidateNamespace({ namespace: 'about' });

      expect(translationRepository.findActiveByNamespace).toHaveBeenCalledWith({
        namespace: 'about',
      });
      expect(
        service.getEntry({
          namespace: 'about',
          key: 'title',
          locale: 'en',
        }).value,
      ).toBe('Updated about');
      expect(findAllActiveRecordsMock).toHaveBeenCalledTimes(1);
    });

    it('should throw when namespace is invalid', async () => {
      await expect(
        service.revalidateNamespace({ namespace: '$invalid' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should serialize concurrent namespace reloads', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);
      await service.onModuleInit();

      let releaseFirstReload!: () => void;
      const firstReloadGate = new Promise<void>((resolve) => {
        releaseFirstReload = resolve;
      });

      findActiveByNamespaceMock.mockImplementation(
        async (params: { namespace: string }) => {
          if (params.namespace === 'about') {
            await firstReloadGate;
            return [
              {
                locale: 'en',
                namespace: 'about',
                key: 'title',
                value: 'Updated about',
                format: 'plain',
                kind: 'text',
                isActive: true,
              },
            ];
          }

          return [
            {
              locale: 'en',
              namespace: 'telegram',
              key: 'weeklyDigest.empty',
              value: 'No gigs this week.',
              format: 'plain',
              kind: 'text',
              isActive: true,
            },
          ];
        },
      );

      const aboutReload = service.revalidateNamespace({ namespace: 'about' });
      const telegramReload = service.revalidateNamespace({
        namespace: 'telegram',
      });

      await Promise.resolve();
      expect(findActiveByNamespaceMock).toHaveBeenCalledTimes(1);
      expect(findActiveByNamespaceMock).toHaveBeenCalledWith({
        namespace: 'about',
      });

      releaseFirstReload();
      await aboutReload;
      await telegramReload;

      expect(findActiveByNamespaceMock).toHaveBeenCalledTimes(2);
      expect(findActiveByNamespaceMock).toHaveBeenLastCalledWith({
        namespace: 'telegram',
      });
      expect(
        service.getEntry({
          namespace: 'about',
          key: 'title',
          locale: 'en',
        }).value,
      ).toBe('Updated about');
      expect(
        service.getEntry({
          namespace: 'telegram',
          key: 'weeklyDigest.empty',
          locale: 'en',
        }).value,
      ).toBe('No gigs this week.');
    });
  });

  describe('getNamespaceEntries', () => {
    it('should return locale registry slice when locale is provided', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);
      await service.onModuleInit();

      const entries = service.getNamespaceEntries({
        namespace: 'about',
        locale: 'en',
      });

      expect(entries.get('title')?.value).toBe('About');
    });

    it('should return all locale registries when locale is omitted', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'telegram',
          key: 'weeklyDigest.empty',
          value: 'There are no gigs scheduled for this week.',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);
      await service.onModuleInit();

      const entries = service.getNamespaceEntries({
        namespace: 'telegram',
      });

      expect(entries.get('en')?.get('weeklyDigest.empty')?.value).toBe(
        'There are no gigs scheduled for this week.',
      );
    });
  });

  describe('listNamespaces', () => {
    it('should return sorted namespace keys from the warm cache', async () => {
      findAllActiveRecordsMock.mockResolvedValue([
        {
          locale: 'en',
          namespace: 'home',
          key: 'cta',
          value: 'Join',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);
      await service.onModuleInit();

      expect(service.listNamespaces()).toEqual(['about', 'home']);
    });
  });

  describe('onModuleDestroy', () => {
    it('should delete TTL interval from scheduler registry', async () => {
      findAllActiveRecordsMock.mockResolvedValue([]);
      getActiveLocaleIsosMock.mockResolvedValue(['en']);
      await service.onModuleInit();

      service.onModuleDestroy();

      expect(deleteIntervalMock).toHaveBeenCalledWith('translation-cache-ttl');
    });
  });
});
