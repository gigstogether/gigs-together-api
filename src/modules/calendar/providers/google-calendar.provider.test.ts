import * as fs from 'fs';

import type { CalendarEvent } from '../calendar.types';
import { GoogleCalendarProvider } from './google-calendar.provider';

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

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
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

describe('GoogleCalendarProvider', () => {
  let provider: GoogleCalendarProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    googleApisMocks.insert.mockResolvedValue({ data: { id: 'event-id' } });
    provider = new GoogleCalendarProvider();
  });

  it('should send local date-times with their IANA time zone', async () => {
    await provider.addEvent(buildEvent());

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

  it('should build a create-event URL with local date-times and ctz', () => {
    const url = new URL(provider.getCreateEventUrl(buildEvent()));

    expect({
      dates: url.searchParams.get('dates'),
      timeZone: url.searchParams.get('ctz'),
    }).toEqual({
      dates: '20261020T200000/20261020T220000',
      timeZone: 'Europe/Madrid',
    });
  });

  it('should reject a malformed local date-time in a create-event URL', () => {
    expect(() =>
      provider.getCreateEventUrl(
        buildEvent({ startLocalDateTime: '2026-10-20T20:00:00Z' }),
      ),
    ).toThrow(
      'Google Calendar local date-time must be a valid YYYY-MM-DDTHH:mm:ss value',
    );
  });

  it('should reject a nonexistent local date-time in a create-event URL', () => {
    expect(() =>
      provider.getCreateEventUrl(
        buildEvent({ startLocalDateTime: '2026-02-31T20:00:00' }),
      ),
    ).toThrow(
      'Google Calendar local date-time must be a valid YYYY-MM-DDTHH:mm:ss value',
    );
  });
});
