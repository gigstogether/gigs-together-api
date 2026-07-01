import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Locale } from '../locale/locale.schema';
import { Translation } from './translation.schema';
import type { TranslationDocument } from './translation.schema';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  let service: TranslationService;

  const localeFindMock = vi.fn();
  const translationFindMock = vi.fn();

  beforeEach(async () => {
    localeFindMock.mockReset();
    translationFindMock.mockReset();

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
          provide: getModelToken(Translation.name),
          useValue: {
            find: translationFindMock,
          },
        },
      ],
    }).compile();

    service = module.get<TranslationService>(TranslationService);
  });

  describe('getTranslationsV1', () => {
    it('should return translations grouped by namespace when locale is supported', async () => {
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'en' }, { iso: 'es' }]),
        }),
      });

      const docs: Array<{
        readonly key: string;
        readonly value: string;
        readonly namespace?: string | null;
        readonly format: TranslationDocument['format'];
      }> = [
        { key: 'hello', value: 'Hello', namespace: '', format: 'plain' },
        { key: 'cta', value: 'Join', namespace: 'home', format: 'plain' },
      ];

      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(docs),
          }),
        }),
      });

      await expect(
        service.getTranslationsV1({
          acceptLanguage: 'en-US,en;q=0.9',
          namespacesQuery: 'default,home',
        }),
      ).resolves.toEqual({
        locale: 'en',
        translations: {
          default: {
            hello: { value: 'Hello', format: 'plain' },
          },
          home: {
            cta: { value: 'Join', format: 'plain' },
          },
        },
      });
    });

    it('should fallback to default locale when accept-language is unsupported', async () => {
      localeFindMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([{ iso: 'es' }]),
        }),
      });

      translationFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

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
});
