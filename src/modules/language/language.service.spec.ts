import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Language } from './language.schema';
import { Translation } from './translation.schema';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  let service: LanguageService;

  const languageFindMock = vi.fn();
  const languageFindOneAndUpdateMock = vi.fn();
  const languageCountDocumentsMock = vi.fn();
  const languageBulkWriteMock = vi.fn();
  const translationFindMock = vi.fn();

  beforeEach(async () => {
    languageFindMock.mockReset();
    languageFindOneAndUpdateMock.mockReset();
    languageCountDocumentsMock.mockReset();
    languageBulkWriteMock.mockReset();
    translationFindMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LanguageService,
        {
          provide: getModelToken(Language.name),
          useValue: {
            find: languageFindMock,
            findOneAndUpdate: languageFindOneAndUpdateMock,
            countDocuments: languageCountDocumentsMock,
            bulkWrite: languageBulkWriteMock,
          },
        },
        {
          provide: getModelToken(Translation.name),
          useValue: {
            find: translationFindMock,
          },
        },
      ],
    }).compile();

    service = module.get<LanguageService>(LanguageService);
  });

  describe('getAllLanguagesOrdered', () => {
    it('should return all languages sorted by order and iso', async () => {
      const execMock = vi.fn().mockResolvedValue([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
        { iso: 'es', name: 'Español', isActive: true, order: 1 },
      ]);
      languageFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({ exec: execMock }),
        }),
      });

      await expect(service.getAllLanguagesOrdered()).resolves.toEqual([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
        { iso: 'es', name: 'Español', isActive: true, order: 1 },
      ]);
    });
  });

  describe('updateLanguageByIso', () => {
    function mockFindOneAndUpdateResult(value: unknown) {
      const execMock = vi.fn().mockResolvedValue(value);
      languageFindOneAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({ exec: execMock }),
        }),
      });
      return execMock;
    }

    it('should update language fields when payload is valid', async () => {
      languageCountDocumentsMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(1),
      });
      mockFindOneAndUpdateResult({
        iso: 'es',
        name: 'Español',
        isActive: false,
        order: 2,
      });

      await expect(
        service.updateLanguageByIso({
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

    it('should throw when language iso is invalid', async () => {
      await expect(
        service.updateLanguageByIso({ iso: 'INVALID', isActive: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw when deactivating the last active language', async () => {
      languageCountDocumentsMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      });

      await expect(
        service.updateLanguageByIso({ iso: 'en', isActive: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw when language is not found', async () => {
      languageCountDocumentsMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(1),
      });
      mockFindOneAndUpdateResult(null);

      await expect(
        service.updateLanguageByIso({ iso: 'en', name: 'English' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateLanguagesOrder', () => {
    it('should bulk update language orders and return ordered list', async () => {
      languageBulkWriteMock.mockResolvedValue({ ok: 1 });
      languageFindMock
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
        service.updateLanguagesOrder({
          languages: [
            { iso: 'es', order: 0 },
            { iso: 'en', order: 1 },
          ],
        }),
      ).resolves.toEqual([
        { iso: 'es', name: 'Español', isActive: true, order: 0 },
        { iso: 'en', name: 'English', isActive: true, order: 1 },
      ]);

      expect(languageBulkWriteMock).toHaveBeenCalledWith([
        {
          updateOne: { filter: { iso: 'es' }, update: { $set: { order: 0 } } },
        },
        {
          updateOne: { filter: { iso: 'en' }, update: { $set: { order: 1 } } },
        },
      ]);
    });

    it('should throw when fewer than two languages are provided', async () => {
      await expect(
        service.updateLanguagesOrder({
          languages: [{ iso: 'en', order: 0 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw when a language iso is not found', async () => {
      languageFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }]),
        }),
      });

      await expect(
        service.updateLanguagesOrder({
          languages: [
            { iso: 'en', order: 0 },
            { iso: 'es', order: 1 },
          ],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
