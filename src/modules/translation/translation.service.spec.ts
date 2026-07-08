import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  let service: TranslationService;
  let translationCacheService: TranslationCacheService;

  const resolveLocaleMock = vi.fn();
  const listNamespacesMock = vi.fn();
  const getNamespaceEntriesMock = vi.fn();

  beforeEach(async () => {
    resolveLocaleMock.mockReset();
    listNamespacesMock.mockReset();
    getNamespaceEntriesMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationService,
        {
          provide: TranslationCacheService,
          useValue: {
            resolveLocale: resolveLocaleMock,
            listNamespaces: listNamespacesMock,
            getNamespaceEntries: getNamespaceEntriesMock,
          },
        },
      ],
    }).compile();

    service = module.get<TranslationService>(TranslationService);
    translationCacheService = module.get<TranslationCacheService>(
      TranslationCacheService,
    );
  });

  describe('getTranslationsV1', () => {
    it('should return translations grouped by namespace when locale is supported', () => {
      resolveLocaleMock.mockReturnValue('en');
      getNamespaceEntriesMock.mockImplementation(
        (params: { namespace: string; locale: string }) => {
          if (params.namespace === 'default') {
            return new Map([
              [
                'hello',
                {
                  namespace: 'default',
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
          namespacesQuery: 'default,home',
        }),
      ).toEqual({
        locale: 'en',
        translations: {
          default: {
            hello: { value: 'Hello', format: 'plain', kind: 'text' },
          },
          home: {
            cta: { value: 'Join', format: 'plain', kind: 'text' },
          },
        },
      });

      expect(translationCacheService.resolveLocale).toHaveBeenCalledWith(
        'en-US,en;q=0.9',
      );
      expect(translationCacheService.getNamespaceEntries).toHaveBeenCalledWith({
        namespace: 'default',
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
});
