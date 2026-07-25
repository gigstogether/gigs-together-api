import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Locale } from '../locale.schema';
import { MongoLocaleRepository } from './mongo-locale.repository';

describe('MongoLocaleRepository', () => {
  let repository: MongoLocaleRepository;

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
        MongoLocaleRepository,
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

    repository = module.get<MongoLocaleRepository>(MongoLocaleRepository);
  });

  describe('findActiveLocalesOrdered', () => {
    it('should query active locales sorted by order and iso', async () => {
      localeFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                iso: ' EN ',
                nativeName: 'English',
                isActive: true,
                order: 0,
              },
            ]),
          }),
        }),
      });

      await expect(repository.findActiveLocalesOrdered()).resolves.toEqual([
        {
          iso: 'en',
          nativeName: 'English',
          isActive: true,
          order: 0,
        },
      ]);

      expect(localeFindMock).toHaveBeenCalledWith(
        { isActive: true },
        {
          _id: 0,
          iso: 1,
          nativeName: 1,
          isActive: 1,
          order: 1,
        },
      );
    });
  });

  describe('findAllLocalesOrdered', () => {
    it('should query all locales sorted by order and iso', async () => {
      localeFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                iso: 'en',
                nativeName: 'English',
                isActive: true,
                order: 0,
              },
            ]),
          }),
        }),
      });

      await expect(repository.findAllLocalesOrdered()).resolves.toEqual([
        {
          iso: 'en',
          nativeName: 'English',
          isActive: true,
          order: 0,
        },
      ]);

      expect(localeFindMock).toHaveBeenCalledWith(
        {},
        {
          _id: 0,
          iso: 1,
          nativeName: 1,
          isActive: 1,
          order: 1,
        },
      );
    });
  });

  describe('countOtherActiveLocales', () => {
    it('should count active locales excluding the given iso', async () => {
      localeCountDocumentsMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(2),
      });

      await expect(repository.countOtherActiveLocales('en')).resolves.toBe(2);

      expect(localeCountDocumentsMock).toHaveBeenCalledWith({
        isActive: true,
        iso: { $ne: 'en' },
      });
    });
  });

  describe('updateLocaleByIso', () => {
    it('should update locale and return mapped SupportedLocale', async () => {
      localeFindOneAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({
              iso: 'es',
              nativeName: 'Español',
              isActive: true,
              order: 1,
            }),
          }),
        }),
      });

      await expect(
        repository.updateLocaleByIso('es', { nativeName: 'Español' }),
      ).resolves.toEqual({
        iso: 'es',
        nativeName: 'Español',
        isActive: true,
        order: 1,
      });
    });

    it('should return null when locale is not found', async () => {
      localeFindOneAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        repository.updateLocaleByIso('missing', { isActive: false }),
      ).resolves.toBeNull();
    });
  });

  describe('findIsosByIsoList', () => {
    it('should return isos for existing locales', async () => {
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }, { iso: 'es' }]),
        }),
      });

      await expect(repository.findIsosByIsoList(['en', 'es'])).resolves.toEqual(
        ['en', 'es'],
      );

      expect(localeFindMock).toHaveBeenCalledWith(
        { iso: { $in: ['en', 'es'] } },
        { iso: 1 },
      );
    });
  });

  describe('bulkOrderUpdate', () => {
    it('should bulk write locale order updates', async () => {
      localeBulkWriteMock.mockResolvedValue({ ok: 1 });

      await repository.bulkOrderUpdate([
        { iso: 'es', order: 0 },
        { iso: 'en', order: 1 },
      ]);

      expect(localeBulkWriteMock).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { iso: 'es' },
            update: { $set: { order: 0 } },
          },
        },
        {
          updateOne: {
            filter: { iso: 'en' },
            update: { $set: { order: 1 } },
          },
        },
      ]);
    });
  });
});
