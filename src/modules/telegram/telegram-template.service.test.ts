import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TranslationService } from '../translation/translation.service';
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

describe('TelegramTemplateService', () => {
  let service: TelegramTemplateService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramTemplateService,
        {
          provide: TranslationService,
          useValue: {
            getActiveNamespaceTranslations: vi
              .fn()
              .mockResolvedValue(
                new Map<string, readonly TranslationBundleEntry[]>([
                  [
                    TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
                    telegramTemplateServiceTestEntries,
                  ],
                ]),
              ),
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
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramTemplateService,
        {
          provide: TranslationService,
          useValue: {
            getActiveNamespaceTranslations: vi
              .fn()
              .mockResolvedValue(new Map()),
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
