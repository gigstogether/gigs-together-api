import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { TranslationCacheService } from '@modules/translation/translation-cache.service';
import { MissingTranslationError } from '@modules/translation/translation.errors';
import { TranslationTemplateService } from '@modules/translation/translation-template.service';
import type { TranslationBundleEntry } from '@modules/translation/types/translation.types';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { DEFAULT_LOCALE_ISO } from '@modules/locale/locale.constants';
import {
  TELEGRAM_TEMPLATE_NAMESPACE,
  TelegramTemplateService,
} from './telegram-template.service';

vi.mock('@modules/locale/locale.constants', () => ({
  DEFAULT_LOCALE_ISO: 'fr',
}));

const telegramTemplateServiceTestEntries: Readonly<
  Record<string, TranslationBundleEntry>
> = {
  [TELEGRAM_TEMPLATE_KEYS.mainGigWithLink]: {
    namespace: TELEGRAM_TEMPLATE_NAMESPACE,
    key: TELEGRAM_TEMPLATE_KEYS.mainGigWithLink,
    value:
      '<a href="{url}">{title}</a>\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    format: 'plain',
    kind: 'template',
    isActive: true,
  },
  [TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty]: {
    namespace: TELEGRAM_TEMPLATE_NAMESPACE,
    key: TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty,
    value: 'There are no gigs scheduled for this week.',
    format: 'plain',
    kind: 'text',
    isActive: true,
  },
};

describe('TelegramTemplateService', () => {
  let service: TelegramTemplateService;
  const getEntryMock = vi.fn();

  beforeEach(async () => {
    getEntryMock.mockReset();
    getEntryMock.mockImplementation(
      (params: { namespace: string; key: string; locale: string }) =>
        telegramTemplateServiceTestEntries[params.key],
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramTemplateService,
        {
          provide: TranslationCacheService,
          useValue: { getEntry: getEntryMock },
        },
        TranslationTemplateService,
      ],
    }).compile();
    service = moduleRef.get(TelegramTemplateService);
  });

  it('should use the application default locale when no locale is supplied', () => {
    expect(service.getText(TELEGRAM_TEMPLATE_KEYS.mainGigWithLink)).toContain(
      '{title}',
    );
    expect(getEntryMock).toHaveBeenCalledWith({
      namespace: TELEGRAM_TEMPLATE_NAMESPACE,
      key: TELEGRAM_TEMPLATE_KEYS.mainGigWithLink,
      locale: DEFAULT_LOCALE_ISO,
    });
  });

  it('should retain the requested locale when loading text with an explicit locale', () => {
    service.getText(TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty, 'es');
    expect(getEntryMock).toHaveBeenCalledWith({
      namespace: TELEGRAM_TEMPLATE_NAMESPACE,
      key: TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty,
      locale: 'es',
    });
  });

  it('should retain the requested locale when rendering a template with an explicit locale', () => {
    service.render(
      TELEGRAM_TEMPLATE_KEYS.mainGigWithLink,
      {
        url: 'https://app.example/gigs/a',
        title: 'Concert',
        dates: 'Mon, 1 Jun 2026',
        venue: 'Hall',
        ticketsUrl: 'https://tickets.example/x',
      },
      'es',
    );
    expect(getEntryMock).toHaveBeenCalledWith({
      namespace: TELEGRAM_TEMPLATE_NAMESPACE,
      key: TELEGRAM_TEMPLATE_KEYS.mainGigWithLink,
      locale: 'es',
    });
  });

  it('should render main gig template with placeholders', () => {
    expect(
      service.render(TELEGRAM_TEMPLATE_KEYS.mainGigWithLink, {
        url: 'https://app.example/gigs/a',
        title: 'Concert',
        dates: 'Mon, 1 Jun 2026',
        venue: 'Hall',
        ticketsUrl: 'https://tickets.example/x',
      }),
    ).toContain('<a href="https://app.example/gigs/a">Concert</a>');
  });

  it('should return weekly digest empty message from cache', () => {
    expect(service.getText(TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty)).toBe(
      'There are no gigs scheduled for this week.',
    );
  });

  it('should throw when translation is missing from cache', () => {
    getEntryMock.mockImplementation(() => {
      throw new MissingTranslationError({
        namespace: TELEGRAM_TEMPLATE_NAMESPACE,
        key: TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty,
        locale: DEFAULT_LOCALE_ISO,
      });
    });

    expect(() =>
      service.getText(TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty),
    ).toThrow(MissingTranslationError);
  });
});
