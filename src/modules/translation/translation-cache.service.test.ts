import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram/telegram-template-keys';
import { TranslationCacheService } from './translation-cache.service';
import { MissingTranslationError } from './translation.errors';
import { TRANSLATION_CACHE_DEFAULT_TTL_MS } from './types/translation-cache.types';
import type { TranslationRecord } from './types/translation.types';

function withRequiredTelegramTranslations(
  records: readonly TranslationRecord[],
): readonly TranslationRecord[] {
  const providedTelegramKeys = new Set(
    records
      .filter(
        (record) => record.namespace === 'telegram' && record.locale === 'en',
      )
      .map((record) => record.key),
  );
  const requiredRecords: TranslationRecord[] = Object.values(
    TELEGRAM_TEMPLATE_KEYS,
  )
    .filter((key) => !providedTelegramKeys.has(key))
    .map((key) => ({
      locale: 'en',
      namespace: 'telegram',
      key,
      value: `Test translation for ${key}`,
      format: 'plain',
      kind: 'template',
      isActive: true,
    }));

  return [...records, ...requiredRecords];
}

describe('TranslationCacheService', () => {
  let service: TranslationCacheService;
  let translationRepository: TranslationRepository;
  let schedulerRegistry: SchedulerRegistry;

  const findAllActiveRecordsMock = vi.fn();
  const findActiveByNamespaceMock = vi.fn();
  const addIntervalMock = vi.fn();
  const deleteIntervalMock = vi.fn();

  beforeEach(async () => {
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
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('onModuleInit', () => {
    it('should warm up cache from all active records and register TTL interval', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );

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

      await expect(service.onModuleInit()).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error && error.message === 'mongo down',
      );
      expect(addIntervalMock).not.toHaveBeenCalled();
    });

    it('should complete warm-up when a required default Telegram translation is missing', async () => {
      const requiredRecords = withRequiredTelegramTranslations([]).filter(
        (record) => record.key !== TELEGRAM_TEMPLATE_KEYS.commandStart,
      );
      findAllActiveRecordsMock.mockResolvedValue(requiredRecords);

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(addIntervalMock).toHaveBeenCalledTimes(1);
      expect(
        service
          .getNamespaceEntries({ namespace: 'telegram', locale: 'en' })
          .has(TELEGRAM_TEMPLATE_KEYS.commandStart),
      ).toBe(false);
      expect(() =>
        service.getEntry({
          namespace: 'telegram',
          key: TELEGRAM_TEMPLATE_KEYS.commandStart,
          locale: 'en',
        }),
      ).toThrow(MissingTranslationError);
    });
  });

  describe('cache TTL configuration', () => {
    it('should use configured positive safe integer as cache TTL', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([]),
      );
      vi.useFakeTimers();
      const configuredService = new TranslationCacheService(
        translationRepository,
        new ConfigService({ TRANSLATION_CACHE_TTL_MS: '25' }),
        schedulerRegistry,
      );

      await configuredService.onModuleInit();
      await vi.advanceTimersByTimeAsync(24);
      expect(findAllActiveRecordsMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(findAllActiveRecordsMock).toHaveBeenCalledTimes(2);
      configuredService.onModuleDestroy();
    });

    it('should throw when configured cache TTL is invalid', () => {
      expect(
        () =>
          new TranslationCacheService(
            translationRepository,
            new ConfigService({ TRANSLATION_CACHE_TTL_MS: '0' }),
            schedulerRegistry,
          ),
      ).toThrow('TRANSLATION_CACHE_TTL_MS must be a positive safe integer.');
    });
  });

  describe('TTL full reload', () => {
    it('should refresh cache when scheduled reload succeeds', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );

      vi.useFakeTimers();
      await service.onModuleInit();

      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'Updated about',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );
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
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );

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

  describe('revalidateNamespace', () => {
    it('should reload only the requested namespace slice', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );
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

    it('should reload full cache when revalidateAll is called', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );
      await service.onModuleInit();

      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About refreshed',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
          {
            locale: 'en',
            namespace: 'common',
            key: 'ok',
            value: 'OK',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );

      await service.revalidateAll();

      expect(findAllActiveRecordsMock).toHaveBeenCalledTimes(2);
      expect(
        service.getEntry({
          namespace: 'about',
          key: 'title',
          locale: 'en',
        }).value,
      ).toBe('About refreshed');
      expect(service.listNamespaces()).toEqual(['about', 'common', 'telegram']);
    });

    it('should serialize concurrent namespace reloads', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );
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

          return withRequiredTelegramTranslations([
            {
              locale: 'en',
              namespace: 'telegram',
              key: 'weeklyDigest.empty',
              value: 'No gigs this week.',
              format: 'plain',
              kind: 'text',
              isActive: true,
            },
          ]);
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
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'about',
            key: 'title',
            value: 'About',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );
      await service.onModuleInit();

      const entries = service.getNamespaceEntries({
        namespace: 'about',
        locale: 'en',
      });

      expect(entries.get('title')?.value).toBe('About');
    });

    it('should return all locale registries when locale is omitted', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
          {
            locale: 'en',
            namespace: 'telegram',
            key: 'weeklyDigest.empty',
            value: 'There are no gigs scheduled for this week.',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        ]),
      );
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
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([
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
        ]),
      );
      await service.onModuleInit();

      expect(service.listNamespaces()).toEqual(['about', 'home', 'telegram']);
    });
  });

  describe('onModuleDestroy', () => {
    it('should delete TTL interval from scheduler registry', async () => {
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([]),
      );
      await service.onModuleInit();

      service.onModuleDestroy();

      expect(deleteIntervalMock).toHaveBeenCalledWith('translation-cache-ttl');
    });
  });
});
