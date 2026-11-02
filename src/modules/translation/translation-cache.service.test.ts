import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AlertSeverity } from '@modules/alerting/alert-delivery';
import {
  AlertingService,
  AlertLogLevel,
} from '@modules/alerting/alerting.service';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram/telegram-template-keys';
import { TranslationCacheService } from './translation-cache.service';
import {
  InvalidTranslationDocumentError,
  MissingTranslationError,
} from './translation.errors';
import { TRANSLATION_CACHE_DEFAULT_TTL_MS } from './types/translation-cache.types';
import type { TranslationRecord } from './types/translation.types';

interface MissingTranslationAccessParams {
  namespace: string;
  key: string;
  locale: string;
}

function accessMissingTranslation(
  service: TranslationCacheService,
  params: MissingTranslationAccessParams,
): void {
  try {
    service.getEntry(params);
  } catch (e) {
    if (e instanceof MissingTranslationError) {
      return;
    }
    throw e;
  }

  throw new Error('Expected MissingTranslationError to be thrown.');
}

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
  let alertingService: AlertingService;

  const findAllActiveRecordsMock = vi.fn();
  const findActiveByNamespaceMock = vi.fn();
  const repositoryFindAllActiveRecordsMock =
    vi.fn<TranslationRepository['findAllActiveRecords']>();
  const repositoryFindActiveByNamespaceMock =
    vi.fn<TranslationRepository['findActiveByNamespace']>();
  const addIntervalMock = vi.fn();
  const deleteIntervalMock = vi.fn();
  const reportFailureBestEffortMock =
    vi.fn<AlertingService['reportFailureBestEffort']>();
  let fullLoadInvalidDocuments: InvalidTranslationDocumentError[];
  let namespaceLoadInvalidDocuments: InvalidTranslationDocumentError[];

  beforeEach(async () => {
    findAllActiveRecordsMock.mockReset();
    findActiveByNamespaceMock.mockReset();
    repositoryFindAllActiveRecordsMock.mockReset();
    repositoryFindActiveByNamespaceMock.mockReset();
    addIntervalMock.mockReset();
    deleteIntervalMock.mockReset();
    reportFailureBestEffortMock.mockReset();
    reportFailureBestEffortMock.mockResolvedValue(undefined);
    fullLoadInvalidDocuments = [];
    namespaceLoadInvalidDocuments = [];
    repositoryFindAllActiveRecordsMock.mockImplementation(async () => ({
      records: await findAllActiveRecordsMock(),
      invalidDocuments: fullLoadInvalidDocuments,
    }));
    repositoryFindActiveByNamespaceMock.mockImplementation(async (params) => ({
      records: await findActiveByNamespaceMock(params),
      invalidDocuments: namespaceLoadInvalidDocuments,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationCacheService,
        {
          provide: TRANSLATION_REPOSITORY,
          useValue: {
            findAllActiveRecords: repositoryFindAllActiveRecordsMock,
            findActiveByNamespace: repositoryFindActiveByNamespaceMock,
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
        {
          provide: AlertingService,
          useValue: {
            reportFailureBestEffort: reportFailureBestEffortMock,
          },
        },
      ],
    }).compile();

    service = module.get<TranslationCacheService>(TranslationCacheService);
    translationRepository = module.get<TranslationRepository>(
      TRANSLATION_REPOSITORY,
    );
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
    alertingService = module.get<AlertingService>(AlertingService);
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
        alertingService,
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
            alertingService,
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

  describe('cache loading invalid translation alert', () => {
    it('should report an invalid document skipped during a full cache load', async () => {
      const invalidDocument = new InvalidTranslationDocumentError({
        documentId: '69b9d66b2ce32c3d060a30d8',
        namespace: 'about',
        key: 'content',
        locale: undefined,
        issues: [
          {
            field: 'locale',
            reason: 'must be a non-empty string',
          },
        ],
      });
      fullLoadInvalidDocuments = [invalidDocument];
      findAllActiveRecordsMock.mockResolvedValue([]);

      await service.revalidateAll();

      expect(reportFailureBestEffortMock).toHaveBeenCalledWith({
        alert: {
          code: 'translationDocumentInvalid',
          severity: AlertSeverity.Warning,
          summary:
            'Invalid translation document was skipped during cache loading.',
          attributes: {
            operation: 'loadRuntimeTranslationCache',
            documentId: '69b9d66b2ce32c3d060a30d8',
            namespace: 'about',
            key: 'content',
            locale: '<missing>',
            invalidFields: 'locale',
          },
        },
        error: invalidDocument,
        logContext: TranslationCacheService.name,
        logNote: 'Invalid translation document skipped during cache loading',
        logLevel: AlertLogLevel.Error,
        isStackTraceIncluded: false,
      });
    });
  });

  describe('getEntry missing translation alert', () => {
    const missingTranslation = {
      namespace: 'about',
      key: 'subtitle',
      locale: 'en',
    };

    it('should report a normalized missing translation once per cache version', () => {
      accessMissingTranslation(service, {
        ...missingTranslation,
        namespace: ' about ',
        locale: 'EN',
      });
      accessMissingTranslation(service, missingTranslation);

      expect(reportFailureBestEffortMock).toHaveBeenCalledTimes(1);
      expect(reportFailureBestEffortMock).toHaveBeenCalledWith({
        alert: {
          code: 'translationEntryMissing',
          severity: AlertSeverity.Warning,
          summary: 'Requested translation is missing from the active cache.',
          attributes: {
            operation: 'getTranslation',
            namespace: 'about',
            key: 'subtitle',
            locale: 'en',
          },
        },
        error: expect.objectContaining({
          name: MissingTranslationError.name,
          namespace: 'about',
          key: 'subtitle',
          locale: 'en',
        }),
        logContext: TranslationCacheService.name,
        logNote: 'Requested translation is missing from the active cache',
        logLevel: AlertLogLevel.Error,
        isStackTraceIncluded: false,
      });
    });

    it('should report different namespace, key, or locale combinations independently', () => {
      accessMissingTranslation(service, missingTranslation);
      accessMissingTranslation(service, {
        ...missingTranslation,
        key: 'title',
      });
      accessMissingTranslation(service, {
        ...missingTranslation,
        locale: 'es',
      });
      accessMissingTranslation(service, {
        ...missingTranslation,
        namespace: 'home',
      });

      expect(reportFailureBestEffortMock).toHaveBeenCalledTimes(4);
    });

    it('should report the same missing translation after full revalidation succeeds', async () => {
      accessMissingTranslation(service, missingTranslation);
      findAllActiveRecordsMock.mockResolvedValue(
        withRequiredTelegramTranslations([]),
      );

      await service.revalidateAll();
      accessMissingTranslation(service, missingTranslation);

      expect(reportFailureBestEffortMock).toHaveBeenCalledTimes(2);
    });

    it('should preserve deduplication when full revalidation fails', async () => {
      accessMissingTranslation(service, missingTranslation);
      findAllActiveRecordsMock.mockRejectedValue(new Error('mongo down'));

      await expect(service.revalidateAll()).rejects.toThrow('mongo down');
      accessMissingTranslation(service, missingTranslation);

      expect(reportFailureBestEffortMock).toHaveBeenCalledTimes(1);
    });

    it('should reset deduplication only for a successfully revalidated namespace', async () => {
      const otherNamespaceMissingTranslation = {
        ...missingTranslation,
        namespace: 'home',
      };
      accessMissingTranslation(service, missingTranslation);
      accessMissingTranslation(service, otherNamespaceMissingTranslation);
      findActiveByNamespaceMock.mockResolvedValue([]);

      await service.revalidateNamespace({ namespace: 'about' });
      accessMissingTranslation(service, missingTranslation);
      accessMissingTranslation(service, otherNamespaceMissingTranslation);

      expect(reportFailureBestEffortMock).toHaveBeenCalledTimes(3);
    });

    it('should preserve deduplication when namespace revalidation fails', async () => {
      accessMissingTranslation(service, missingTranslation);
      findActiveByNamespaceMock.mockRejectedValue(new Error('mongo down'));

      await service.revalidateNamespace({ namespace: 'about' });
      accessMissingTranslation(service, missingTranslation);

      expect(reportFailureBestEffortMock).toHaveBeenCalledTimes(1);
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
