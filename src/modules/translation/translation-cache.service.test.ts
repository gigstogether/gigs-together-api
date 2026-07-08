import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Locale } from '../locale/locale.schema';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';
import { TranslationCacheService } from './translation-cache.service';

describe('TranslationCacheService', () => {
  let service: TranslationCacheService;
  let translationRepository: TranslationRepository;

  const localeFindMock = vi.fn();
  const findAllActiveRecordsMock = vi.fn();
  const findActiveByNamespaceMock = vi.fn();
  const addIntervalMock = vi.fn();
  const deleteIntervalMock = vi.fn();

  beforeEach(async () => {
    localeFindMock.mockReset();
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
          provide: getModelToken(Locale.name),
          useValue: {
            find: localeFindMock,
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
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }, { iso: 'es' }]),
        }),
      });

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

    it('should keep stale cache when warm-up fails', async () => {
      findAllActiveRecordsMock.mockRejectedValue(new Error('mongo down'));
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });

      await service.onModuleInit();

      expect(() =>
        service.getEntry({
          namespace: 'about',
          key: 'title',
          locale: 'en',
        }),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('resolveLocale', () => {
    it('should resolve supported locale from cache without querying Mongo', async () => {
      findAllActiveRecordsMock.mockResolvedValue([]);
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }, { iso: 'es' }]),
        }),
      });

      await service.onModuleInit();

      expect(service.resolveLocale('es-ES,es;q=0.9')).toBe('es');
      expect(localeFindMock).toHaveBeenCalledTimes(1);
      expect(service.resolveLocale('es')).toBe('es');
      expect(localeFindMock).toHaveBeenCalledTimes(1);
    });

    it('should fallback to default locale when accept-language is unsupported', async () => {
      findAllActiveRecordsMock.mockResolvedValue([]);
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'es' }]),
        }),
      });

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
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });
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
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });
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
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });
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
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });
      await service.onModuleInit();

      expect(service.listNamespaces()).toEqual(['about', 'home']);
    });
  });

  describe('onModuleDestroy', () => {
    it('should delete TTL interval from scheduler registry', async () => {
      findAllActiveRecordsMock.mockResolvedValue([]);
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });
      await service.onModuleInit();

      service.onModuleDestroy();

      expect(deleteIntervalMock).toHaveBeenCalledWith('translation-cache-ttl');
    });
  });
});
