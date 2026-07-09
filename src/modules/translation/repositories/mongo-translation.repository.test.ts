import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Translation } from '../translation.schema';
import { MongoTranslationRepository } from './mongo-translation.repository';

describe('MongoTranslationRepository', () => {
  let repository: MongoTranslationRepository;

  const translationFindMock = vi.fn();
  const translationDistinctMock = vi.fn();
  const translationFindOneAndUpdateMock = vi.fn();

  beforeEach(async () => {
    translationFindMock.mockReset();
    translationDistinctMock.mockReset();
    translationFindOneAndUpdateMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoTranslationRepository,
        {
          provide: getModelToken(Translation.name),
          useValue: {
            find: translationFindMock,
            distinct: translationDistinctMock,
            findOneAndUpdate: translationFindOneAndUpdateMock,
          },
        },
      ],
    }).compile();

    repository = module.get<MongoTranslationRepository>(
      MongoTranslationRepository,
    );
  });

  describe('findActiveByNamespace', () => {
    it('should query active translations for a namespace sorted by locale and key', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
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
          _id: 0,
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
          _id: 0,
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
    it('should upsert translation by namespace locale and key', async () => {
      translationFindOneAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({
              _id: '64f1a2b3c4d5e6f7a8b9c0d1',
              locale: 'en',
              namespace: 'about',
              key: 'title',
              value: 'About us',
              format: 'plain',
              kind: 'text',
              isActive: true,
            }),
          }),
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
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        locale: 'en',
        namespace: 'about',
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      });

      expect(translationFindOneAndUpdateMock).toHaveBeenCalledWith(
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
        { upsert: true, returnDocument: 'after' },
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
