import type { CalendarEvent } from '../calendar.types';

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');

export interface CalendarProvider {
  addEvent(event: CalendarEvent): Promise<void>;
  getCreateEventUrl(event: CalendarEvent): string;
}
