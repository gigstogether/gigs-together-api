import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Translation } from '../translation.schema';
import { MongoTranslationRepository } from './mongo-translation.repository';

describe('MongoTranslationRepository', () => {
  let repository: MongoTranslationRepository;

  const translationFindMock = vi.fn();
  const translationDistinctMock = vi.fn();
  const translationUpdateOneMock = vi.fn();
  const translationFindOneAndUpdateMock = vi.fn();
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    translationFindMock.mockReset();
    translationDistinctMock.mockReset();
    translationUpdateOneMock.mockReset();
    translationFindOneAndUpdateMock.mockReset();
    loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoTranslationRepository,
        {
          provide: getModelToken(Translation.name),
          useValue: {
            find: translationFindMock,
            distinct: translationDistinctMock,
            updateOne: translationUpdateOneMock,
            findOneAndUpdate: translationFindOneAndUpdateMock,
          },
        },
      ],
    }).compile();

    repository = module.get<MongoTranslationRepository>(
      MongoTranslationRepository,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('findActiveByNamespace', () => {
    it('should query active translations for a namespace sorted by locale and key', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                _id: '64f1a2b3c4d5e6f7a8b9c0d0',
                locale: 'en',
                namespace: 'telegram',
                key: 'weeklyDigest.empty',
                value: 'There are no gigs scheduled for this week.',
                format: 'plain',
                kind: 'text',
                isActive: true,
              },
            ]),
          }),
        }),
      });

      await expect(
        repository.findActiveByNamespace({ namespace: 'telegram' }),
      ).resolves.toEqual([
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

      expect(translationFindMock).toHaveBeenCalledWith(
        { namespace: 'telegram', isActive: true },
        {
          _id: 1,
          locale: 1,
          namespace: 1,
          key: 1,
          value: 1,
          format: 1,
          kind: 1,
          isActive: 1,
        },
      );
    });
  });

  describe('findAllActiveRecords', () => {
    it('should query all active translation records sorted by namespace, locale, and key', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                _id: '64f1a2b3c4d5e6f7a8b9c0d0',
                locale: 'en',
                namespace: 'about',
                key: 'title',
                value: 'About',
                format: 'plain',
                kind: 'text',
                isActive: true,
              },
            ]),
          }),
        }),
      });

      await expect(repository.findAllActiveRecords()).resolves.toEqual([
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

      expect(translationFindMock).toHaveBeenCalledWith(
        { isActive: true },
        {
          _id: 1,
          locale: 1,
          namespace: 1,
          key: 1,
          value: 1,
          format: 1,
          kind: 1,
          isActive: 1,
        },
      );
    });

    it('should skip and log every issue in an invalid document while returning valid records', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                _id: '64f1a2b3c4d5e6f7a8b9c0d0',
              },
              {
                _id: '64f1a2b3c4d5e6f7a8b9c0d1',
                locale: 'en',
                namespace: 'about',
                key: 'title',
                value: 'About',
                format: 'plain',
                kind: 'text',
                isActive: true,
              },
            ]),
          }),
        }),
      });

      await expect(repository.findAllActiveRecords()).resolves.toEqual([
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
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Translation document "64f1a2b3c4d5e6f7a8b9c0d0" (namespace=<missing>, key=<missing>, locale=<missing>) is invalid: locale must be a non-empty string; namespace must be a non-empty string; key must be a non-empty string; value must be a non-empty string; format must be one of "plain" or "icu"; kind must be one of "text" or "template"; isActive must be a boolean.',
        ),
      );
    });

    it('should include available translation identifiers when logging an invalid document', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                _id: '69b9d66b2ce32c3d060a30d8',
                namespace: 'telegram',
                key: 'command.suggest.privateUnavailable',
                value: 'This command is unavailable in private chats.',
                format: 'plain',
                kind: 'text',
                isActive: true,
              },
            ]),
          }),
        }),
      });

      await expect(repository.findAllActiveRecords()).resolves.toEqual([]);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Skipping invalid translation document during runtime cache loading. Translation document "69b9d66b2ce32c3d060a30d8" (namespace="telegram", key="command.suggest.privateUnavailable", locale=<missing>) is invalid: locale must be a non-empty string.',
      );
    });
  });

  describe('findByNamespace', () => {
    it('should query all translations for namespace including inactive records', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                _id: '64f1a2b3c4d5e6f7a8b9c0d1',
                locale: 'en',
                namespace: 'about',
                key: 'title',
                value: 'About',
                format: 'plain',
                kind: 'text',
                isActive: false,
              },
            ]),
          }),
        }),
      });

      await expect(
        repository.findByNamespace({ namespace: 'about', locale: 'en' }),
      ).resolves.toEqual([
        {
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: false,
        },
      ]);

      expect(translationFindMock).toHaveBeenCalledWith(
        { namespace: 'about', locale: 'en' },
        {
          _id: 1,
          locale: 1,
          namespace: 1,
          key: 1,
          value: 1,
          format: 1,
          kind: 1,
          isActive: 1,
        },
      );
    });
  });

  describe('findAll', () => {
    it('should query all translations across namespaces sorted by namespace locale and key', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                _id: '64f1a2b3c4d5e6f7a8b9c0d2',
                locale: 'en',
                namespace: 'country',
                key: 'es',
                value: 'Spain',
                format: 'plain',
                kind: 'text',
                isActive: true,
              },
            ]),
          }),
        }),
      });

      await expect(repository.findAll({ locale: 'en' })).resolves.toEqual([
        {
          id: '64f1a2b3c4d5e6f7a8b9c0d2',
          locale: 'en',
          namespace: 'country',
          key: 'es',
          value: 'Spain',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);

      expect(translationFindMock).toHaveBeenCalledWith(
        { locale: 'en' },
        {
          _id: 1,
          locale: 1,
          namespace: 1,
          key: 1,
          value: 1,
          format: 1,
          kind: 1,
          isActive: 1,
        },
      );
    });
  });

  describe('listDistinctNamespaces', () => {
    it('should return sorted distinct namespace values from the collection', async () => {
      translationDistinctMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(['country', 'about']),
      });

      await expect(repository.listDistinctNamespaces()).resolves.toEqual([
        'about',
        'country',
      ]);

      expect(translationDistinctMock).toHaveBeenCalledWith('namespace');
    });
  });

  describe('upsertRecord', () => {
    it('should report when an upsert creates a translation', async () => {
      translationUpdateOneMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 1,
          upsertedId: '64f1a2b3c4d5e6f7a8b9c0d1',
        }),
      });

      await expect(
        repository.upsertRecord({
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).resolves.toEqual({
        isCreated: true,
      });

      expect(translationUpdateOneMock).toHaveBeenCalledWith(
        { namespace: 'about', locale: 'en', key: 'title' },
        {
          $set: {
            namespace: 'about',
            locale: 'en',
            key: 'title',
            value: 'About us',
            format: 'plain',
            kind: 'text',
            isActive: true,
          },
        },
        { upsert: true },
      );
    });

    it('should report when an upsert updates an existing translation', async () => {
      translationUpdateOneMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
          upsertedId: null,
        }),
      });

      const result = await repository.upsertRecord({
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      });

      expect(result.isCreated).toBe(false);
    });

    it('should report a matched unchanged translation as existing', async () => {
      translationUpdateOneMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 0,
          upsertedCount: 0,
          upsertedId: null,
        }),
      });

      await expect(
        repository.upsertRecord({
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).resolves.toEqual({ isCreated: false });
    });

    it('should reject an unacknowledged upsert', async () => {
      translationUpdateOneMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ acknowledged: false }),
      });

      await expect(
        repository.upsertRecord({
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).rejects.toThrow('Translation upsert was not acknowledged.');
    });

    it('should reject an acknowledged upsert without a matched or created document', async () => {
      translationUpdateOneMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 0,
          upsertedId: null,
        }),
      });

      await expect(
        repository.upsertRecord({
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).rejects.toThrow(
        'Translation upsert did not create or match a document.',
      );
    });
  });

  describe('setActiveById', () => {
    it('should update isActive flag by id', async () => {
      translationFindOneAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({
              _id: '64f1a2b3c4d5e6f7a8b9c0d1',
              locale: 'en',
              namespace: 'about',
              key: 'title',
              value: 'About',
              format: 'plain',
              kind: 'text',
              isActive: false,
            }),
          }),
        }),
      });

      await expect(
        repository.setActiveById({
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          isActive: false,
        }),
      ).resolves.toEqual({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        locale: 'en',
        namespace: 'about',
        key: 'title',
        value: 'About',
        format: 'plain',
        kind: 'text',
        isActive: false,
      });

      expect(translationFindOneAndUpdateMock).toHaveBeenCalledWith(
        { _id: '64f1a2b3c4d5e6f7a8b9c0d1' },
        { $set: { isActive: false } },
        { returnDocument: 'after' },
      );
    });

    it('should return null when translation id is not found', async () => {
      translationFindOneAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        repository.setActiveById({
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          isActive: false,
        }),
      ).resolves.toBeNull();
    });
  });
});
