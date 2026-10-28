import * as fs from 'fs';

import { CalendarService } from './calendar.service';
import type { CalendarishEvent } from './calendar.service';

const googleApisMocks = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn(),
    },
    calendar: vi.fn(() => ({
      events: {
        insert: googleApisMocks.insert,
      },
    })),
  },
}));

function buildEvent(
  overrides: Partial<CalendarishEvent> = {},
): CalendarishEvent {
  return {
    title: 'The Strokes',
    description: 'Tickets: https://tickets.example/the-strokes',
    location: 'Palau Sant Jordi, Barcelona, ES',
    startLocalDateTime: '2026-10-20T20:00:00',
    endLocalDateTime: '2026-10-20T22:00:00',
    timeZone: 'Europe/Madrid',
    ...overrides,
  };
}

describe('CalendarService', () => {
  let service: CalendarService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    googleApisMocks.insert.mockResolvedValue({ data: { id: 'event-id' } });
    service = new CalendarService();
  });

  it('should send local date-times with their IANA time zone', async () => {
    await service.addEvent(buildEvent());

    expect(googleApisMocks.insert).toHaveBeenCalledWith({
      calendarId: undefined,
      requestBody: {
        colorId: '5',
        summary: 'The Strokes',
        description: 'Tickets: https://tickets.example/the-strokes',
        location: 'Palau Sant Jordi, Barcelona, ES',
        start: {
          dateTime: '2026-10-20T20:00:00',
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: '2026-10-20T22:00:00',
          timeZone: 'Europe/Madrid',
        },
      },
    });
  });

  it('should build a template URL with local date-times and ctz', () => {
    const url = new URL(service.getCreateCalendarEventUrl(buildEvent()));

    expect({
      dates: url.searchParams.get('dates'),
      timeZone: url.searchParams.get('ctz'),
    }).toEqual({
      dates: '20261020T200000/20261020T220000',
      timeZone: 'Europe/Madrid',
    });
  });

  it('should reject a malformed local date-time in a template URL', () => {
    expect(() =>
      service.getCreateCalendarEventUrl(
        buildEvent({ startLocalDateTime: '2026-10-20T20:00:00Z' }),
      ),
    ).toThrow(
      'Google Calendar local date-time must be a valid YYYY-MM-DDTHH:mm:ss value',
    );
  });

  it('should reject a nonexistent local date-time in a template URL', () => {
    expect(() =>
      service.getCreateCalendarEventUrl(
        buildEvent({ startLocalDateTime: '2026-02-31T20:00:00' }),
      ),
    ).toThrow(
      'Google Calendar local date-time must be a valid YYYY-MM-DDTHH:mm:ss value',
    );
  });
});
