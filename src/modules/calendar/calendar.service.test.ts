import { CalendarService } from './calendar.service';
import type { CalendarEvent } from './calendar.types';
import type { CalendarProvider } from './providers/calendar.provider';

const event: CalendarEvent = {
  title: 'The Strokes',
  description: 'Tickets: https://tickets.example/the-strokes',
  location: 'Palau Sant Jordi, Barcelona, ES',
  startLocalDateTime: '2026-10-20T20:00:00',
  endLocalDateTime: '2026-10-20T22:00:00',
  timeZone: 'Europe/Madrid',
};

describe('CalendarService', () => {
  const addEvent = vi.fn<CalendarProvider['addEvent']>();
  const getCreateEventUrl = vi.fn<CalendarProvider['getCreateEventUrl']>();
  const calendarProvider: CalendarProvider = {
    addEvent,
    getCreateEventUrl,
  };
  let service: CalendarService;

  beforeEach(() => {
    vi.clearAllMocks();
    addEvent.mockResolvedValue(undefined);
    service = new CalendarService(calendarProvider);
  });

  it('should delegate event creation to the configured provider', async () => {
    await service.addEvent(event);

    expect(addEvent).toHaveBeenCalledWith(event);
  });

  it('should return the create-event URL from the configured provider', () => {
    getCreateEventUrl.mockReturnValue('https://calendar.example/event');

    expect(service.getCreateCalendarEventUrl(event)).toBe(
      'https://calendar.example/event',
    );
  });
});
