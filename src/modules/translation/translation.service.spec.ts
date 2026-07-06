import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Locale } from '../locale/locale.schema';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  let service: TranslationService;
  let translationRepository: TranslationRepository;

  const localeFindMock = vi.fn();
  const findActiveTranslationsMock = vi.fn();
  const findActiveByNamespaceMock = vi.fn();

  beforeEach(async () => {
    localeFindMock.mockReset();
    findActiveTranslationsMock.mockReset();
    findActiveByNamespaceMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationService,
        {
          provide: getModelToken(Locale.name),
          useValue: {
            find: localeFindMock,
          },
        },
        {
          provide: TRANSLATION_REPOSITORY,
          useValue: {
            findActiveTranslations: findActiveTranslationsMock,
            findActiveByNamespace: findActiveByNamespaceMock,
          },
        },
      ],
    }).compile();

    service = module.get<TranslationService>(TranslationService);
    translationRepository = module.get<TranslationRepository>(
      TRANSLATION_REPOSITORY,
    );
  });

  describe('getTranslationsV1', () => {
    it('should return translations grouped by namespace when locale is supported', async () => {
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }, { iso: 'es' }]),
        }),
      });

      findActiveTranslationsMock.mockResolvedValue([
        {
          key: 'hello',
          value: 'Hello',
          namespace: '',
          format: 'plain',
          kind: 'text',
        },
        {
          key: 'cta',
          value: 'Join',
          namespace: 'home',
          format: 'plain',
          kind: 'text',
        },
      ]);

      await expect(
        service.getTranslationsV1({
          acceptLanguage: 'en-US,en;q=0.9',
          namespacesQuery: 'default,home',
        }),
      ).resolves.toEqual({
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

      expect(translationRepository.findActiveTranslations).toHaveBeenCalledWith(
        {
          locale: 'en',
          namespaces: ['default', 'home'],
        },
      );
    });

    it('should fallback to default locale when accept-language is unsupported', async () => {
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'es' }]),
        }),
      });

      findActiveTranslationsMock.mockResolvedValue([]);

      await expect(
        service.getTranslationsV1({
          acceptLanguage: 'fr-FR',
          namespacesQuery: undefined,
        }),
      ).resolves.toEqual({
        locale: 'en',
        translations: {},
      });
    });

    it('should throw when namespaces are invalid', async () => {
      await expect(
        service.getTranslationsV1({
          acceptLanguage: undefined,
          namespacesQuery: '$invalid',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getActiveNamespaceTranslations', () => {
    it('should return active entries grouped by locale when namespace is valid', async () => {
      findActiveByNamespaceMock.mockResolvedValue([
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

      const result = await service.getActiveNamespaceTranslations({
        namespace: 'telegram',
      });

      expect(result.get('en')).toEqual([
        {
          namespace: 'telegram',
          key: 'weeklyDigest.empty',
          value: 'There are no gigs scheduled for this week.',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ]);

      expect(translationRepository.findActiveByNamespace).toHaveBeenCalledWith({
        namespace: 'telegram',
      });
    });

    it('should throw when namespace is invalid', async () => {
      await expect(
        service.getActiveNamespaceTranslations({
          namespace: '$invalid',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
