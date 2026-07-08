import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TranslationCacheService } from '../translation/translation-cache.service';
import { TranslationTemplateService } from '../translation/translation-template.service';
import type { TranslationBundleEntry } from '../translation/types/translation.types';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import {
  TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
  TELEGRAM_TEMPLATE_NAMESPACE,
  TelegramTemplateService,
} from './telegram-template.service';

const telegramTemplateServiceTestEntries: readonly TranslationBundleEntry[] = [
  {
    namespace: TELEGRAM_TEMPLATE_NAMESPACE,
    key: TELEGRAM_TEMPLATE_KEYS.mainGigWithLink,
    value:
      '<a href="{url}">{title}</a>\n\n🗓 {dates}\n📍 {venue}\n\n🎫 {ticketsUrl}',
    format: 'plain',
    kind: 'template',
    isActive: true,
  },
  {
    namespace: TELEGRAM_TEMPLATE_NAMESPACE,
    key: TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty,
    value: 'There are no gigs scheduled for this week.',
    format: 'plain',
    kind: 'text',
    isActive: true,
  },
];

function toNamespaceRegistry(
  entries: readonly TranslationBundleEntry[],
): Map<string, Map<string, TranslationBundleEntry>> {
  const byKey = new Map<string, TranslationBundleEntry>();
  for (const entry of entries) {
    byKey.set(entry.key, entry);
  }

  return new Map([[TELEGRAM_TEMPLATE_DEFAULT_LOCALE, byKey]]);
}

describe('TelegramTemplateService', () => {
  let service: TelegramTemplateService;

  const getNamespaceEntriesMock = vi.fn();

  beforeEach(async () => {
    getNamespaceEntriesMock.mockReset();
    getNamespaceEntriesMock.mockReturnValue(
      toNamespaceRegistry(telegramTemplateServiceTestEntries),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramTemplateService,
        {
          provide: TranslationCacheService,
          useValue: {
            getNamespaceEntries: getNamespaceEntriesMock,
          },
        },
        TranslationTemplateService,
      ],
    }).compile();

    service = moduleRef.get(TelegramTemplateService);
    await service.onModuleInit();
  });

  it('should load the English telegram template bundle', () => {
    expect(service.getText(TELEGRAM_TEMPLATE_KEYS.mainGigWithLink)).toContain(
      '{title}',
    );
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

  it('should return weekly digest empty message from seeded translations', () => {
    expect(service.getText(TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty)).toBe(
      'There are no gigs scheduled for this week.',
    );
  });

  it('should finish module init when translations are missing', async () => {
    getNamespaceEntriesMock.mockReturnValue(new Map());

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramTemplateService,
        {
          provide: TranslationCacheService,
          useValue: {
            getNamespaceEntries: getNamespaceEntriesMock,
          },
        },
        TranslationTemplateService,
      ],
    }).compile();

    const emptyService = moduleRef.get(TelegramTemplateService);
    await expect(emptyService.onModuleInit()).resolves.toBeUndefined();
    expect(() =>
      emptyService.getText(TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty),
    ).toThrow(InternalServerErrorException);
  });
});
