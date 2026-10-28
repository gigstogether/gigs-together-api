import { Inject, Injectable } from '@nestjs/common';
import { CALENDAR_PROVIDER } from './providers/calendar.provider';
import type { CalendarProvider } from './providers/calendar.provider';
import type { CalendarEvent } from './calendar.types';

/** Stable facade used by application modules regardless of calendar provider. */
@Injectable()
export class CalendarService {
  constructor(
    @Inject(CALENDAR_PROVIDER)
    private readonly calendarProvider: CalendarProvider,
  ) {}

  addEvent(event: CalendarEvent): Promise<void> {
    return this.calendarProvider.addEvent(event);
  }

  getCreateCalendarEventUrl(event: CalendarEvent): string {
    return this.calendarProvider.getCreateEventUrl(event);
  }
}
