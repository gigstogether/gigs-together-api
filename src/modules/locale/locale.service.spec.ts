import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { LocaleService } from './locale.service';
import { LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS } from './locale-cache.constants';
import { LOCALE_REPOSITORY } from './repositories/locale.repository';

describe('LocaleService', () => {
  let service: LocaleService;

  const findActiveLocalesOrderedMock = vi.fn();
  const findAllLocalesOrderedMock = vi.fn();
  const countOtherActiveLocalesMock = vi.fn();
  const updateLocaleByIsoMock = vi.fn();
  const findIsosByIsoListMock = vi.fn();
  const bulkOrderUpdateMock = vi.fn();
  const addIntervalMock = vi.fn();
  const deleteIntervalMock = vi.fn();

  beforeEach(async () => {
    findActiveLocalesOrderedMock.mockReset();
    findAllLocalesOrderedMock.mockReset();
    countOtherActiveLocalesMock.mockReset();
    updateLocaleByIsoMock.mockReset();
    findIsosByIsoListMock.mockReset();
    bulkOrderUpdateMock.mockReset();
    addIntervalMock.mockReset();
    deleteIntervalMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocaleService,
        {
          provide: LOCALE_REPOSITORY,
          useValue: {
            findActiveLocalesOrdered: findActiveLocalesOrderedMock,
            findAllLocalesOrdered: findAllLocalesOrderedMock,
            countOtherActiveLocales: countOtherActiveLocalesMock,
            updateLocaleByIso: updateLocaleByIsoMock,
            findIsosByIsoList: findIsosByIsoListMock,
            bulkOrderUpdate: bulkOrderUpdateMock,
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
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);

      await service.onModuleInit();

      expect(service.getActiveLocaleIsos()).toEqual(['en', 'es']);
      expect(addIntervalMock).toHaveBeenCalledTimes(1);
    });

    it('should throw when warm-up fails', async () => {
      findActiveLocalesOrderedMock.mockRejectedValue(new Error('mongo down'));

      await expect(service.onModuleInit()).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error && error.message === 'mongo down',
      );
      expect(addIntervalMock).not.toHaveBeenCalled();
    });
  });

  describe('TTL active locales refresh', () => {
    it('should refresh active locales when scheduled reload succeeds', async () => {
      findActiveLocalesOrderedMock
        .mockResolvedValueOnce([
          { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
          { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
        ])
        .mockResolvedValue([
          { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        ]);

      vi.useFakeTimers();
      await service.onModuleInit();
      await vi.advanceTimersByTimeAsync(LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS);
      await vi.runOnlyPendingTimersAsync();

      expect(service.getActiveLocaleIsos()).toEqual(['en']);
    });

    it('should keep stale active locales when scheduled reload fails', async () => {
      findActiveLocalesOrderedMock.mockResolvedValueOnce([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);

      vi.useFakeTimers();
      await service.onModuleInit();

      findActiveLocalesOrderedMock.mockRejectedValue(new Error('mongo down'));
      await vi.advanceTimersByTimeAsync(LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS);
      await vi.runOnlyPendingTimersAsync();

      expect(service.getActiveLocaleIsos()).toEqual(['en', 'es']);
    });
  });

  describe('getActiveLocaleIsos', () => {
    it('should return active locale isos from cache', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      await service.onModuleInit();

      expect(service.getActiveLocaleIsos()).toEqual(['en', 'es']);
    });

    it('should fallback to default locale iso when no active locales exist in Mongo', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([]);
      await service.onModuleInit();

      expect(service.getActiveLocaleIsos()).toEqual(['en']);
    });
  });

  describe('getLocalesV1', () => {
    it('should return active locales from cache without querying Mongo again', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      await service.onModuleInit();

      expect(service.getLocalesV1()).toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      expect(findActiveLocalesOrderedMock).toHaveBeenCalledTimes(1);
      expect(service.getLocalesV1()).toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      expect(findActiveLocalesOrderedMock).toHaveBeenCalledTimes(1);
    });

    it('should return empty list when no active locales exist in Mongo', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([]);
      await service.onModuleInit();

      expect(service.getLocalesV1()).toEqual([]);
    });
  });

  describe('resolveLocale', () => {
    it('should resolve supported locale from cache without querying Mongo again', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
      await service.onModuleInit();

      expect(service.resolveLocale('es-ES,es;q=0.9')).toBe('es');
      expect(findActiveLocalesOrderedMock).toHaveBeenCalledTimes(1);
      expect(service.resolveLocale('es')).toBe('es');
      expect(findActiveLocalesOrderedMock).toHaveBeenCalledTimes(1);
    });

    it('should fallback to default locale when accept-language is unsupported', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
      ]);
      await service.onModuleInit();

      expect(service.resolveLocale('fr-FR')).toBe('en');
    });
  });

  describe('revalidateActiveLocalesCache', () => {
    it('should reload active locales from repository', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]);
      await service.onModuleInit();

      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);

      await service.revalidateActiveLocalesCache();

      expect(service.getActiveLocaleIsos()).toEqual(['en', 'es']);
      expect(findActiveLocalesOrderedMock).toHaveBeenCalledTimes(2);
    });

    it('should propagate repository errors', async () => {
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]);
      await service.onModuleInit();

      findActiveLocalesOrderedMock.mockRejectedValue(new Error('mongo down'));

      await expect(service.revalidateActiveLocalesCache()).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error && error.message === 'mongo down',
      );
    });
  });

  describe('getAllLocalesOrdered', () => {
    it('should return all locales sorted by order and iso', async () => {
      findAllLocalesOrderedMock.mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);

      await expect(service.getAllLocalesOrdered()).resolves.toEqual([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
        { iso: 'es', nativeName: 'Español', isActive: true, order: 1 },
      ]);
    });
  });

  describe('updateLocaleByIso', () => {
    it('should update locale fields when payload is valid', async () => {
      countOtherActiveLocalesMock.mockResolvedValue(1);
      updateLocaleByIsoMock.mockResolvedValue({
        iso: 'es',
        nativeName: 'Español',
        isActive: false,
        order: 2,
      });
      findActiveLocalesOrderedMock.mockResolvedValue([
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
      countOtherActiveLocalesMock.mockResolvedValue(0);

      await expect(
        service.updateLocaleByIso({ iso: 'en', isActive: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw when locale is not found', async () => {
      countOtherActiveLocalesMock.mockResolvedValue(1);
      updateLocaleByIsoMock.mockResolvedValue(null);

      await expect(
        service.updateLocaleByIso({ iso: 'en', nativeName: 'English' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateLocalesOrder', () => {
    it('should bulk update locale orders and return ordered list', async () => {
      bulkOrderUpdateMock.mockResolvedValue(undefined);
      findIsosByIsoListMock.mockResolvedValue(['en', 'es']);
      findActiveLocalesOrderedMock.mockResolvedValue([
        { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
        { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
      ]);
      findAllLocalesOrderedMock.mockResolvedValue([
        { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
        { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
      ]);

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

      expect(bulkOrderUpdateMock).toHaveBeenCalledWith([
        { iso: 'es', order: 0 },
        { iso: 'en', order: 1 },
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
      findIsosByIsoListMock.mockResolvedValue(['en']);

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
      findActiveLocalesOrderedMock.mockResolvedValue([
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
