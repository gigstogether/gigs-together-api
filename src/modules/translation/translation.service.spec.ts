import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LocaleService } from '../locale/locale.service';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationRevalidateService } from './translation-revalidate.service';
import { TranslationService } from './translation.service';
import type { TranslationRepository } from './repositories/translation.repository';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';

describe('TranslationService', () => {
  let service: TranslationService;
  let localeService: LocaleService;
  let translationCacheService: TranslationCacheService;

  const resolveLocaleMock = vi.fn();
  const listNamespacesMock = vi.fn();
  const getNamespaceEntriesMock = vi.fn();
  const findByNamespaceMock = vi.fn();
  const findAllMock = vi.fn();
  const listDistinctNamespacesMock = vi.fn();
  const upsertRecordMock = vi.fn();
  const setActiveByIdMock = vi.fn();
  const revalidateAfterWriteMock = vi.fn();

  const translationRepository: TranslationRepository = {
    findByNamespace: findByNamespaceMock,
    findAll: findAllMock,
    listDistinctNamespaces: listDistinctNamespacesMock,
    findActiveByNamespace: vi.fn(),
    findAllActiveRecords: vi.fn(),
    upsertRecord: upsertRecordMock,
    setActiveById: setActiveByIdMock,
  };

  beforeEach(async () => {
    resolveLocaleMock.mockReset();
    listNamespacesMock.mockReset();
    getNamespaceEntriesMock.mockReset();
    findByNamespaceMock.mockReset();
    findAllMock.mockReset();
    listDistinctNamespacesMock.mockReset();
    upsertRecordMock.mockReset();
    setActiveByIdMock.mockReset();
    revalidateAfterWriteMock.mockReset();
    revalidateAfterWriteMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationService,
        {
          provide: LocaleService,
          useValue: {
            resolveLocale: resolveLocaleMock,
          },
        },
        {
          provide: TranslationCacheService,
          useValue: {
            listNamespaces: listNamespacesMock,
            getNamespaceEntries: getNamespaceEntriesMock,
          },
        },
        {
          provide: TranslationRevalidateService,
          useValue: {
            revalidateAfterWrite: revalidateAfterWriteMock,
          },
        },
        {
          provide: TRANSLATION_REPOSITORY,
          useValue: translationRepository,
        },
      ],
    }).compile();

    service = module.get<TranslationService>(TranslationService);
    localeService = module.get<LocaleService>(LocaleService);
    translationCacheService = module.get<TranslationCacheService>(
      TranslationCacheService,
    );
  });

  describe('getTranslationsV1', () => {
    it('should return translations grouped by namespace when locale is supported', () => {
      resolveLocaleMock.mockReturnValue('en');
      getNamespaceEntriesMock.mockImplementation(
        (params: { namespace: string; locale: string }) => {
          if (params.namespace === 'common') {
            return new Map([
              [
                'hello',
                {
                  namespace: 'common',
                  key: 'hello',
                  value: 'Hello',
                  format: 'plain',
                  kind: 'text',
                  isActive: true,
                },
              ],
            ]);
          }
          if (params.namespace === 'home') {
            return new Map([
              [
                'cta',
                {
                  namespace: 'home',
                  key: 'cta',
                  value: 'Join',
                  format: 'plain',
                  kind: 'text',
                  isActive: true,
                },
              ],
            ]);
          }
          return new Map();
        },
      );

      expect(
        service.getTranslationsV1({
          acceptLanguage: 'en-US,en;q=0.9',
          namespacesQuery: 'common,home',
        }),
      ).toEqual({
        locale: 'en',
        translations: {
          common: {
            hello: { value: 'Hello', format: 'plain', kind: 'text' },
          },
          home: {
            cta: { value: 'Join', format: 'plain', kind: 'text' },
          },
        },
      });

      expect(localeService.resolveLocale).toHaveBeenCalledWith(
        'en-US,en;q=0.9',
      );
      expect(translationCacheService.getNamespaceEntries).toHaveBeenCalledWith({
        namespace: 'common',
        locale: 'en',
      });
      expect(translationCacheService.getNamespaceEntries).toHaveBeenCalledWith({
        namespace: 'home',
        locale: 'en',
      });
      expect(translationCacheService.listNamespaces).not.toHaveBeenCalled();
    });

    it('should read all cached namespaces when namespaces query is omitted', () => {
      resolveLocaleMock.mockReturnValue('en');
      listNamespacesMock.mockReturnValue(['about']);
      getNamespaceEntriesMock.mockReturnValue(
        new Map([
          [
            'title',
            {
              namespace: 'about',
              key: 'title',
              value: 'About',
              format: 'plain',
              kind: 'text',
              isActive: true,
            },
          ],
        ]),
      );

      expect(
        service.getTranslationsV1({
          acceptLanguage: 'en',
          namespacesQuery: undefined,
        }),
      ).toEqual({
        locale: 'en',
        translations: {
          about: {
            title: { value: 'About', format: 'plain', kind: 'text' },
          },
        },
      });

      expect(translationCacheService.listNamespaces).toHaveBeenCalledTimes(1);
    });

    it('should fallback to default locale when accept-language is unsupported', () => {
      resolveLocaleMock.mockReturnValue('en');
      listNamespacesMock.mockReturnValue([]);

      expect(
        service.getTranslationsV1({
          acceptLanguage: 'fr-FR',
          namespacesQuery: undefined,
        }),
      ).toEqual({
        locale: 'en',
        translations: {},
      });
    });

    it('should throw when namespaces are invalid', () => {
      expect(() =>
        service.getTranslationsV1({
          acceptLanguage: undefined,
          namespacesQuery: '$invalid',
        }),
      ).toThrow(BadRequestException);
    });

    it('should omit namespaces with no entries for the resolved locale', () => {
      resolveLocaleMock.mockReturnValue('en');
      getNamespaceEntriesMock.mockReturnValue(new Map());

      expect(
        service.getTranslationsV1({
          acceptLanguage: 'en',
          namespacesQuery: 'missing',
        }),
      ).toEqual({
        locale: 'en',
        translations: {},
      });
    });
  });

  describe('listDistinctNamespaces', () => {
    it('should return valid camelCase namespaces sorted from repository', async () => {
      listDistinctNamespacesMock.mockResolvedValue([
        'country',
        'about',
        '$invalid',
      ]);

      await expect(service.listDistinctNamespaces()).resolves.toEqual([
        'country',
        'about',
      ]);
    });
  });

  describe('listRecords', () => {
    it('should list all translations when namespace is omitted', async () => {
      findAllMock.mockResolvedValue([
        {
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);

      await expect(service.listRecords({ locale: 'EN' })).resolves.toEqual([
        {
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);

      expect(findAllMock).toHaveBeenCalledWith({ locale: 'en' });
      expect(findByNamespaceMock).not.toHaveBeenCalled();
    });

    it('should list translations for namespace and optional locale', async () => {
      findByNamespaceMock.mockResolvedValue([
        {
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);

      await expect(
        service.listRecords({ namespace: ' about ', locale: 'EN' }),
      ).resolves.toEqual([
        {
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);

      expect(findByNamespaceMock).toHaveBeenCalledWith({
        namespace: 'about',
        locale: 'en',
      });
    });

    it('should reject invalid namespace when listing translations', () => {
      expect(() => service.listRecords({ namespace: '$invalid' })).toThrow(
        BadRequestException,
      );
      expect(() => service.listRecords({ namespace: '$invalid' })).toThrow(
        'namespace has invalid format',
      );
    });
  });

  describe('upsertRecord', () => {
    it('should upsert translation when payload is valid', async () => {
      upsertRecordMock.mockResolvedValue({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      });

      await expect(
        service.upsertRecord({
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
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      });

      expect(revalidateAfterWriteMock).toHaveBeenCalledWith({
        namespace: 'about',
      });
    });

    it('should reject invalid translation key when upserting', async () => {
      await expect(
        service.upsertRecord({
          namespace: 'about',
          locale: 'en',
          key: 'invalid_key',
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        }),
      ).rejects.toSatisfy((error: unknown) => {
        return (
          error instanceof BadRequestException &&
          error.message === 'key has invalid format'
        );
      });
    });

    it('should reject non-plain format when upserting', async () => {
      await expect(
        service.upsertRecord({
          namespace: 'about',
          locale: 'en',
          key: 'title',
          value: 'About us',
          format: 'icu',
          kind: 'text',
          isActive: true,
        }),
      ).rejects.toSatisfy((error: unknown) => {
        return (
          error instanceof BadRequestException &&
          error.message === 'format must be plain'
        );
      });
    });
  });

  describe('setActiveById', () => {
    it('should toggle translation active flag by id', async () => {
      setActiveByIdMock.mockResolvedValue({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About',
        format: 'plain',
        kind: 'text',
        isActive: false,
      });

      await expect(
        service.setActiveById({
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          isActive: false,
        }),
      ).resolves.toEqual({
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        namespace: 'about',
        locale: 'en',
        key: 'title',
        value: 'About',
        format: 'plain',
        kind: 'text',
        isActive: false,
      });

      expect(revalidateAfterWriteMock).toHaveBeenCalledWith({
        namespace: 'about',
      });
    });

    it('should throw NotFoundException when translation id is missing', async () => {
      setActiveByIdMock.mockResolvedValue(null);

      await expect(
        service.setActiveById({
          id: '64f1a2b3c4d5e6f7a8b9c0d1',
          isActive: false,
        }),
      ).rejects.toSatisfy((error: unknown) => {
        return (
          error instanceof NotFoundException &&
          error.message === 'Translation "64f1a2b3c4d5e6f7a8b9c0d1" not found'
        );
      });
    });

    it('should reject invalid translation id format', async () => {
      await expect(
        service.setActiveById({
          id: 'not-an-object-id',
          isActive: false,
        }),
      ).rejects.toSatisfy((error: unknown) => {
        return (
          error instanceof BadRequestException &&
          error.message === 'id has invalid format'
        );
      });
    });
  });
});
