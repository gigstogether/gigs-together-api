import { describe, expect, it } from 'vitest';
import { formatTelegramGigDates } from './telegram-date';

describe('formatTelegramGigDates', () => {
  it('should format a single Gig date', () => {
    const date = Date.UTC(2026, 5, 1, 12);

    const result = formatTelegramGigDates(date);

    expect(result).toBe('Mon, 1 Jun 2026');
  });

  it('should format a Gig date range when end date is provided', () => {
    const date = Date.UTC(2026, 5, 1, 12);
    const endDate = Date.UTC(2026, 5, 2, 12);

    const result = formatTelegramGigDates(date, endDate);

    expect(result).toBe('Mon, 1 Jun 2026 - Tue, 2 Jun 2026');
  });
});
