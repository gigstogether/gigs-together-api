import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CalendarEvent } from '../calendar.types';
import { GoogleCalendarProvider } from './google-calendar.provider';

const googleApisMocks = vi.hoisted(() => ({
  getCalendar: vi.fn(),
  insert: vi.fn(),
  jwt: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('@googleapis/calendar', () => ({
  auth: {
    JWT: googleApisMocks.jwt,
  },
  calendar: vi.fn(() => ({
    calendars: {
      get: googleApisMocks.getCalendar,
    },
    events: {
      insert: googleApisMocks.insert,
    },
  })),
}));

const serviceAccountCredentials = {
  type: 'service_account',
  client_email: 'calendar@example.iam.gserviceaccount.com',
  private_key: 'private-key',
  private_key_id: 'private-key-id',
  project_id: 'calendar-project',
};

function createConfigService(
  config: Record<string, unknown> = {},
): ConfigService {
  return new ConfigService({
    CALENDAR_ID: '  calendar-id  ',
    GOOGLE_AUTH_JSON: JSON.stringify(serviceAccountCredentials),
    ...config,
  });
}

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
    vi.stubEnv('GOOGLE_AUTH_JSON', '');
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '');
    vi.clearAllMocks();
    googleApisMocks.getCalendar.mockResolvedValue({
      data: { id: 'calendar-id' },
    });
    googleApisMocks.insert.mockResolvedValue({ data: { id: 'event-id' } });
    provider = new GoogleCalendarProvider(createConfigService());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should verify access to the configured calendar with a timeout', async () => {
    provider.onApplicationBootstrap();

    await vi.waitFor(() => {
      expect(googleApisMocks.getCalendar).toHaveBeenCalledWith(
        { calendarId: 'calendar-id' },
        { timeout: 10_000 },
      );
    });
  });

  it('should log a connection failure without rejecting', async () => {
    const connectionFailure = new Error('Calendar API unavailable');
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    googleApisMocks.getCalendar.mockRejectedValueOnce(connectionFailure);

    provider.onApplicationBootstrap();

    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'Google Calendar connection check failed; application will continue running',
          message: connectionFailure.message,
        }),
        connectionFailure.stack,
        GoogleCalendarProvider.name,
      );
    });
  });

  it('should send local date-times and trimmed calendar ID', async () => {
    await provider.addEvent(buildEvent());

    expect(googleApisMocks.insert).toHaveBeenCalledWith({
      calendarId: 'calendar-id',
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

  it('should reject missing calendar ID when creating the provider', () => {
    expect(
      () =>
        new GoogleCalendarProvider(createConfigService({ CALENDAR_ID: '' })),
    ).toThrow('CALENDAR_ID is not configured.');
  });

  it('should construct a JWT client from raw service account credentials', () => {
    expect(googleApisMocks.jwt).toHaveBeenLastCalledWith({
      email: serviceAccountCredentials.client_email,
      key: serviceAccountCredentials.private_key,
      keyId: serviceAccountCredentials.private_key_id,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
  });

  it('should decode base64 service account credentials', () => {
    const encodedCredentials = Buffer.from(
      JSON.stringify(serviceAccountCredentials),
      'utf8',
    ).toString('base64');

    new GoogleCalendarProvider(
      createConfigService({ GOOGLE_AUTH_JSON: encodedCredentials }),
    );

    expect(googleApisMocks.jwt).toHaveBeenLastCalledWith({
      email: serviceAccountCredentials.client_email,
      key: serviceAccountCredentials.private_key,
      keyId: serviceAccountCredentials.private_key_id,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
  });

  it('should load service account credentials from the configured file', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(serviceAccountCredentials),
    );

    new GoogleCalendarProvider(
      createConfigService({
        GOOGLE_AUTH_JSON: '',
        GOOGLE_APPLICATION_CREDENTIALS: '  ./google-auth.json  ',
      }),
    );

    expect(fs.readFileSync).toHaveBeenCalledWith('./google-auth.json', 'utf8');
    expect(googleApisMocks.jwt).toHaveBeenLastCalledWith({
      email: serviceAccountCredentials.client_email,
      key: serviceAccountCredentials.private_key,
      keyId: serviceAccountCredentials.private_key_id,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
  });

  it('should reject missing service account configuration', () => {
    expect(
      () =>
        new GoogleCalendarProvider(
          createConfigService({ GOOGLE_AUTH_JSON: '' }),
        ),
    ).toThrow(
      'GOOGLE_AUTH_JSON or GOOGLE_APPLICATION_CREDENTIALS must be configured.',
    );
  });

  it('should reject multiple service account sources', () => {
    expect(
      () =>
        new GoogleCalendarProvider(
          createConfigService({
            GOOGLE_APPLICATION_CREDENTIALS: './google-auth.json',
          }),
        ),
    ).toThrow(
      'Configure only one Google service account source: GOOGLE_AUTH_JSON or GOOGLE_APPLICATION_CREDENTIALS.',
    );
  });

  it('should reject invalid GOOGLE_AUTH_JSON', () => {
    expect(
      () =>
        new GoogleCalendarProvider(
          createConfigService({ GOOGLE_AUTH_JSON: '{invalid-json' }),
        ),
    ).toThrow('GOOGLE_AUTH_JSON must contain valid JSON.');
  });

  it('should reject non-service-account credentials', () => {
    expect(
      () =>
        new GoogleCalendarProvider(
          createConfigService({
            GOOGLE_AUTH_JSON: JSON.stringify({
              ...serviceAccountCredentials,
              type: 'authorized_user',
            }),
          }),
        ),
    ).toThrow('GOOGLE_AUTH_JSON must contain service account credentials.');
  });

  it.each(['client_email', 'private_key'] as const)(
    'should reject service account credentials without %s',
    (field) => {
      const invalidCredentials: Record<string, unknown> = {
        ...serviceAccountCredentials,
      };
      invalidCredentials[field] = '';

      expect(
        () =>
          new GoogleCalendarProvider(
            createConfigService({
              GOOGLE_AUTH_JSON: JSON.stringify(invalidCredentials),
            }),
          ),
      ).toThrow(`GOOGLE_AUTH_JSON must contain a non-empty ${field}.`);
    },
  );

  it('should report a configured credentials file read failure', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('file unavailable');
    });

    expect(
      () =>
        new GoogleCalendarProvider(
          createConfigService({
            GOOGLE_AUTH_JSON: '',
            GOOGLE_APPLICATION_CREDENTIALS: './google-auth.json',
          }),
        ),
    ).toThrow(
      'Failed to read the GOOGLE_APPLICATION_CREDENTIALS file: file unavailable',
    );
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
