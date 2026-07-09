import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Locale } from './locale.schema';
import { LocaleService } from './locale.service';
import { LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS } from './locale-cache.constants';

describe('LocaleService', () => {
  let service: LocaleService;

  const localeFindMock = vi.fn();
  const localeFindOneAndUpdateMock = vi.fn();
  const localeCountDocumentsMock = vi.fn();
  const localeBulkWriteMock = vi.fn();
  const addIntervalMock = vi.fn();
  const deleteIntervalMock = vi.fn();

  function mockActiveLocalesCacheQueryResult(value: unknown) {
    localeFindMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(value),
        }),
      }),
    });
  }

  beforeEach(async () => {
    localeFindMock.mockReset();
    localeFindOneAndUpdateMock.mockReset();
    localeCountDocumentsMock.mockReset();
    localeBulkWriteMock.mockReset();
    addIntervalMock.mockReset();
    deleteIntervalMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocaleService,
        {
          provide: getModelToken(Locale.name),
          useValue: {
            find: localeFindMock,
            findOneAndUpdate: localeFindOneAndUpdateMock,
            countDocuments: localeCountDocumentsMock,
            bulkWrite: localeBulkWriteMock,
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

    service = module.get<LocaleService>(LocaleService);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.onModuleDestroy();
  });

  describe('onModuleInit', () => {
    it('should warm up active locales cache and register TTL interval', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);

      await service.onModuleInit();

      expect(service.getActiveLocaleIsos()).toEqual(['en', 'es']);
      expect(addIntervalMock).toHaveBeenCalledTimes(1);
    });

    it('should throw when warm-up fails', async () => {
      localeFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockRejectedValue(new Error('mongo down')),
          }),
        }),
      });

      await expect(service.onModuleInit()).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error && error.message === 'mongo down',
      );
      expect(addIntervalMock).not.toHaveBeenCalled();
    });
  });

  describe('TTL active locales refresh', () => {
    it('should refresh active locales when scheduled reload succeeds', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);

      vi.useFakeTimers();
      await service.onModuleInit();

      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]);
      await vi.advanceTimersByTimeAsync(LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS);
      await vi.runOnlyPendingTimersAsync();

      expect(service.getActiveLocaleIsos()).toEqual(['en']);
    });

    it('should keep stale active locales when scheduled reload fails', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);

      vi.useFakeTimers();
      await service.onModuleInit();

      localeFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockRejectedValue(new Error('mongo down')),
          }),
        }),
      });
      await vi.advanceTimersByTimeAsync(LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS);
      await vi.runOnlyPendingTimersAsync();

      expect(service.getActiveLocaleIsos()).toEqual(['en', 'es']);
    });
  });

  describe('getActiveLocaleIsos', () => {
    it('should return normalized active locale isos from cache', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: ' EN ', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
        { iso: '  ', nativeName: 'Invalid', isActive: true, order: 2 },
      ]);
      await service.onModuleInit();

      expect(service.getActiveLocaleIsos()).toEqual(['en', 'es']);
    });

    it('should fallback to default locale iso when no active locales exist in Mongo', async () => {
      mockActiveLocalesCacheQueryResult([]);
      await service.onModuleInit();

      expect(service.getActiveLocaleIsos()).toEqual(['en']);
    });
  });

  describe('getLocalesV1', () => {
    it('should return active locales from cache without querying Mongo again', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      await service.onModuleInit();

      expect(service.getLocalesV1()).toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      expect(localeFindMock).toHaveBeenCalledTimes(1);
      expect(service.getLocalesV1()).toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      expect(localeFindMock).toHaveBeenCalledTimes(1);
    });

    it('should return empty list when no active locales exist in Mongo', async () => {
      mockActiveLocalesCacheQueryResult([]);
      await service.onModuleInit();

      expect(service.getLocalesV1()).toEqual([]);
    });
  });

  describe('resolveLocale', () => {
    it('should resolve supported locale from cache without querying Mongo again', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      await service.onModuleInit();

      expect(service.resolveLocale('es-ES,es;q=0.9')).toBe('es');
      expect(localeFindMock).toHaveBeenCalledTimes(1);
      expect(service.resolveLocale('es')).toBe('es');
      expect(localeFindMock).toHaveBeenCalledTimes(1);
    });

    it('should fallback to default locale when accept-language is unsupported', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
      ]);
      await service.onModuleInit();

      expect(service.resolveLocale('fr-FR')).toBe('en');
    });
  });

  describe('getAllLocalesOrdered', () => {
    it('should return all locales sorted by order and iso', async () => {
      const execMock = vi.fn().mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      localeFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({ exec: execMock }),
        }),
      });

      await expect(service.getAllLocalesOrdered()).resolves.toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
    });
  });

  describe('updateLocaleByIso', () => {
    function mockFindOneAndUpdateResult(value: unknown) {
      const execMock = vi.fn().mockResolvedValue(value);
      localeFindOneAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({ exec: execMock }),
        }),
      });
      return execMock;
    }

    it('should update locale fields when payload is valid', async () => {
      localeCountDocumentsMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(1),
      });
      mockFindOneAndUpdateResult({
        iso: 'es',
        nativeName: 'Español',
        isActive: false,
        order: 2,
      });
      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]);

      await expect(
        service.updateLocaleByIso({
          iso: 'es',
          isActive: false,
          order: 2,
        }),
      ).resolves.toEqual({
        iso: 'es',
        nativeName: 'Español',
        isActive: false,
        order: 2,
      });
    });

    it('should throw when locale iso is invalid', async () => {
      await expect(
        service.updateLocaleByIso({ iso: 'INVALID', isActive: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw when deactivating the last active locale', async () => {
      localeCountDocumentsMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      });

      await expect(
        service.updateLocaleByIso({ iso: 'en', isActive: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw when locale is not found', async () => {
      localeCountDocumentsMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(1),
      });
      mockFindOneAndUpdateResult(null);

      await expect(
        service.updateLocaleByIso({ iso: 'en', nativeName: 'English' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateLocalesOrder', () => {
    it('should bulk update locale orders and return ordered list', async () => {
      localeBulkWriteMock.mockResolvedValue({ ok: 1 });
      localeFindMock
        .mockReturnValueOnce({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([{ iso: 'en' }, { iso: 'es' }]),
          }),
        })
        .mockReturnValueOnce({
          sort: vi.fn().mockReturnValue({
            lean: vi.fn().mockReturnValue({
              exec: vi.fn().mockResolvedValue([
                { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
                { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          sort: vi.fn().mockReturnValue({
            lean: vi.fn().mockReturnValue({
              exec: vi.fn().mockResolvedValue([
                { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
                { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
              ]),
            }),
          }),
        });

      await expect(
        service.updateLocalesOrder({
          locales: [
            { iso: 'es', order: 0 },
            { iso: 'en', order: 1 },
          ],
        }),
      ).resolves.toEqual([
        { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
        { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
      ]);

      expect(localeBulkWriteMock).toHaveBeenCalledWith([
        {
          updateOne: { filter: { iso: 'es' }, update: { $set: { order: 0 } } },
        },
        {
          updateOne: { filter: { iso: 'en' }, update: { $set: { order: 1 } } },
        },
      ]);
    });

    it('should throw when fewer than two locales are provided', async () => {
      await expect(
        service.updateLocalesOrder({
          locales: [{ iso: 'en', order: 0 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw when a locale iso is not found', async () => {
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });

      await expect(
        service.updateLocalesOrder({
          locales: [
            { iso: 'en', order: 0 },
            { iso: 'es', order: 1 },
          ],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('onModuleDestroy', () => {
    it('should delete TTL interval from scheduler registry', async () => {
      mockActiveLocalesCacheQueryResult([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]);
      await service.onModuleInit();

      service.onModuleDestroy();

      expect(deleteIntervalMock).toHaveBeenCalledWith(
        'locale-active-cache-ttl',
      );
    });
  });
});
