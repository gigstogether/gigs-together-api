import { DEFAULT_LOCALE_ISO } from '@modules/locale/locale.constants';
import { Logger } from '@nestjs/common';
import type { GigCalendarSource } from '../types/gig.types';
import { GigCalendarService } from './gig-calendar.service';

function buildGigCalendarSource(
  overrides: Partial<GigCalendarSource> = {},
): GigCalendarSource {
  return {
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    locality: {
      countryIso: 'ES',
      name: 'Barcelona',
      timeZone: 'Europe/Madrid',
    },
    venues: [{ name: 'Palau Sant Jordi' }],
    ticketsUrl: 'https://tickets.example/radiohead',
    ...overrides,
  };
}

describe('GigCalendarService', () => {
  let service: GigCalendarService;

  beforeEach(() => {
    service = new GigCalendarService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should preserve local event time without a UTC suffix', () => {
    const result = service.toCalendarEvent({
      gig: buildGigCalendarSource(),
      locale: DEFAULT_LOCALE_ISO,
    });

    expect(result).toEqual({
      title: 'Radiohead',
      description: 'Tickets: https://tickets.example/radiohead',
      location: 'Palau Sant Jordi, Barcelona, Spain',
      startLocalDateTime: '2026-06-12T20:00:00',
      endLocalDateTime: '2026-06-12T22:00:00',
      timeZone: 'Europe/Madrid',
    });
  });

  it('should use the final local day for a multi-day event', () => {
    const result = service.toCalendarEvent({
      gig: buildGigCalendarSource({ endDate: Date.UTC(2026, 5, 14) }),
      locale: DEFAULT_LOCALE_ISO,
    });

    expect(result.endLocalDateTime).toBe('2026-06-14T22:00:00');
  });

  it('should reject an invalid start date', () => {
    expect(() =>
      service.toCalendarEvent({
        gig: buildGigCalendarSource({ date: Number.NaN }),
        locale: DEFAULT_LOCALE_ISO,
      }),
    ).toThrow('Gig date must be a valid timestamp');
  });

  it('should use all Venue names and the Locality time zone', () => {
    const result = service.toCalendarEvent({
      gig: buildGigCalendarSource({
        locality: {
          countryIso: 'PT',
          name: 'Lisbon',
          timeZone: 'Europe/Lisbon',
        },
        venues: [{ name: 'Venue One' }, { name: 'Venue Two' }],
      }),
      locale: DEFAULT_LOCALE_ISO,
    });

    expect(result).toEqual(
      expect.objectContaining({
        location: 'Venue One, Venue Two, Lisbon, Portugal',
        timeZone: 'Europe/Lisbon',
      }),
    );
  });

  it('should log and fall back to a Country ISO code without a localized display name', () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const gig = buildGigCalendarSource({
      locality: {
        countryIso: 'AA',
        name: 'Unknown',
        timeZone: 'Etc/UTC',
      },
    });

    const firstResult = service.toCalendarEvent({
      gig,
      locale: DEFAULT_LOCALE_ISO,
    });
    const secondResult = service.toCalendarEvent({
      gig,
      locale: DEFAULT_LOCALE_ISO,
    });

    expect([firstResult.location, secondResult.location]).toEqual([
      'Palau Sant Jordi, Unknown, AA',
      'Palau Sant Jordi, Unknown, AA',
    ]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
