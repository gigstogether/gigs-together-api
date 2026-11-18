import { Injectable, Logger } from '@nestjs/common';
import type { CalendarEvent } from '@modules/calendar/calendar.types';
import type { GigCalendarSource } from '../types/gig.types';

// Shared Calendar event text currently uses one explicit locale; callers can supply a dynamic locale later.
export const GIG_CALENDAR_TEXT_LOCALE = 'en';

export interface ToGigCalendarEventParams {
  gig: GigCalendarSource;
  locale: string;
}

function formatCalendarDate(value: number, field: 'date' | 'endDate'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Gig ${field} must be a valid timestamp`);
  }

  return date.toISOString().slice(0, 10);
}

@Injectable()
export class GigCalendarService {
  private readonly logger = new Logger(GigCalendarService.name);
  private readonly countryDisplayNamesByLocale = new Map<
    string,
    Intl.DisplayNames
  >();

  toCalendarEvent(params: ToGigCalendarEventParams): CalendarEvent {
    const { gig, locale } = params;
    const countryName = this.getCountryName(gig.locality.countryIso, locale);

    // Use an evening window from 20:00 to 22:00 in the event's local time
    // zone. Google resolves the UTC offset from the IANA time zone.
    const startDate = formatCalendarDate(gig.date, 'date');

    // Multi-day events end at 22:00 on the final day. Clamp an invalid
    // earlier end date to the start day so the end never precedes the start.
    const requestedEndDate =
      gig.endDate !== undefined
        ? formatCalendarDate(gig.endDate, 'endDate')
        : startDate;
    const endDate =
      requestedEndDate >= startDate ? requestedEndDate : startDate;

    return {
      title: gig.title,
      description: `Tickets: ${gig.ticketsUrl}`,
      location: [
        gig.venues.map((venue) => venue.name).join(', '),
        gig.locality.name,
        countryName,
      ]
        .filter((str) => !!str)
        .join(', '),
      startLocalDateTime: `${startDate}T20:00:00`,
      endLocalDateTime: `${endDate}T22:00:00`,
      timeZone: gig.locality.timeZone,
    };
  }

  private getCountryName(countryIso: string, locale: string): string {
    const countryName = this.getCountryDisplayNames(locale).of(countryIso);
    if (countryName !== undefined) {
      return countryName;
    }

    this.logger.warn(
      `Country ISO code "${countryIso}" has no display name for locale "${locale}"; using the ISO code in Calendar location text.`,
    );

    return countryIso;
  }

  private getCountryDisplayNames(locale: string): Intl.DisplayNames {
    const cachedDisplayNames = this.countryDisplayNamesByLocale.get(locale);
    if (cachedDisplayNames !== undefined) {
      return cachedDisplayNames;
    }

    const displayNames = new Intl.DisplayNames([locale], {
      type: 'region',
      fallback: 'none',
    });
    this.countryDisplayNamesByLocale.set(locale, displayNames);

    return displayNames;
  }
}
