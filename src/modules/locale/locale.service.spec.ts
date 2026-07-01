import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Locale } from './locale.schema';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  let service: LocaleService;

  const localeFindMock = vi.fn();
  const localeFindOneAndUpdateMock = vi.fn();
  const localeCountDocumentsMock = vi.fn();
  const localeBulkWriteMock = vi.fn();

  beforeEach(async () => {
    localeFindMock.mockReset();
    localeFindOneAndUpdateMock.mockReset();
    localeCountDocumentsMock.mockReset();
    localeBulkWriteMock.mockReset();

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
      ],
    }).compile();

    service = module.get<LocaleService>(LocaleService);
  });

  describe('getAllLocalesOrdered', () => {
    it('should return all locales sorted by order and iso', async () => {
      const execMock = vi.fn().mockResolvedValue([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
        { iso: 'es', name: 'Español', isActive: true, order: 1 },
      ]);
      localeFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({ exec: execMock }),
        }),
      });

      await expect(service.getAllLocalesOrdered()).resolves.toEqual([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
        { iso: 'es', name: 'Español', isActive: true, order: 1 },
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
        name: 'Español',
        isActive: false,
        order: 2,
      });

      await expect(
        service.updateLocaleByIso({
          iso: 'es',
          isActive: false,
          order: 2,
        }),
      ).resolves.toEqual({
        iso: 'es',
        name: 'Español',
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
                { iso: 'es', name: 'Español', isActive: true, order: 0 },
                { iso: 'en', name: 'English', isActive: true, order: 1 },
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
        { iso: 'es', name: 'Español', isActive: true, order: 0 },
        { iso: 'en', name: 'English', isActive: true, order: 1 },
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
});
