import { describe, it, expect } from 'vitest';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { TelegramTemplateService } from './telegram-template.service';

describe('TelegramTemplateService', () => {
  it('should load the English telegram template bundle', () => {
    const service = new TelegramTemplateService();

    expect(service.getText(TELEGRAM_TEMPLATE_KEYS.mainGigWithLink)).toContain(
      '{title}',
    );
  });

  it('should render main gig template with placeholders', () => {
    const service = new TelegramTemplateService();

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

  it('should return weekly digest empty message from seed bundle', () => {
    const service = new TelegramTemplateService();

    expect(service.getText(TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty)).toBe(
      'There are no gigs scheduled for this week.',
    );
  });
});
