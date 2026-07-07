import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Translation } from '../translation.schema';
import { MongoTranslationRepository } from './mongo-translation.repository';

describe('MongoTranslationRepository', () => {
  let repository: MongoTranslationRepository;

  const translationFindMock = vi.fn();

  beforeEach(async () => {
    translationFindMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoTranslationRepository,
        {
          provide: getModelToken(Translation.name),
          useValue: {
            find: translationFindMock,
          },
        },
      ],
    }).compile();

    repository = module.get<MongoTranslationRepository>(
      MongoTranslationRepository,
    );
  });

  describe('findActiveTranslations', () => {
    it('should query active translations by locale and namespace filter', async () => {
      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              {
                key: 'hello',
                value: 'Hello',
                namespace: 'home',
                format: 'plain',
                kind: 'text',
              },
            ]),
          }),
        }),
      });

      await expect(
        repository.findActiveTranslations({
          locale: 'en',
          namespaces: ['home', 'about'],
        }),
      ).resolves.toEqual([
        {
          key: 'hello',
          value: 'Hello',
          namespace: 'home',
          format: 'plain',
          kind: 'text',
        },
      ]);

      expect(translationFindMock).toHaveBeenCalledWith(
        {
          locale: 'en',
          isActive: true,
          namespace: { $in: ['home', 'about'] },
        },
        {
          _id: 0,
          key: 1,
          value: 1,
          namespace: 1,
          format: 1,
          kind: 1,
        },
      );
    });
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
});
