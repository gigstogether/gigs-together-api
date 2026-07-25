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
          useValue: {
            getEntry: getEntryMock,
          },
        },
        TranslationTemplateService,
      ],
    }).compile();

    service = moduleRef.get(TelegramTemplateService);
  });

  it('should return telegram text from cache', () => {
    expect(service.getText(TELEGRAM_TEMPLATE_KEYS.mainGigWithLink)).toContain(
      '{title}',
    );
    expect(getEntryMock).toHaveBeenCalledWith({
      namespace: TELEGRAM_TEMPLATE_NAMESPACE,
      key: TELEGRAM_TEMPLATE_KEYS.mainGigWithLink,
      locale: TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
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
      throw new InternalServerErrorException(
        `Translation "${TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty}" is missing for namespace "${TELEGRAM_TEMPLATE_NAMESPACE}" and locale "${TELEGRAM_TEMPLATE_DEFAULT_LOCALE}".`,
      );
    });

    expect(() =>
      service.getText(TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty),
    ).toThrow(InternalServerErrorException);
  });
});
