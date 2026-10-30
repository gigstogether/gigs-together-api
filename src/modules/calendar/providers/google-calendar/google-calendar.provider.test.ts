import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CalendarEvent } from '../../calendar.types';
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

function createGaxiosError(): Error {
  return Object.assign(new Error('Not Found'), {
    [Symbol.for('gaxios-gaxios-error')]: '8.3.2',
    code: 404,
    status: 404,
    config: {
      method: 'GET',
      timeout: 10_000,
    },
    response: {
      data: {
        error: {
          message: 'Not Found',
        },
      },
    },
  });
}

function getUnavailableIntegrationLog(
  config: Record<string, unknown>,
): unknown {
  const loggerErrorSpy = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  const unavailableProvider = new GoogleCalendarProvider(
    createConfigService(config),
  );

  unavailableProvider.onApplicationBootstrap();

  return loggerErrorSpy.mock.calls[0]?.[0];
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

  it('should log a concise structured Gaxios error', async () => {
    const connectionFailure = createGaxiosError();
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    googleApisMocks.getCalendar.mockRejectedValueOnce(connectionFailure);

    provider.onApplicationBootstrap();

    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith({
        event: 'google_calendar_connection_check_failed',
        operation: 'calendars.get',
        status: 404,
        message: 'Not Found',
        hint: 'Calendar does not exist or the service account has no access',
      });
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

  it('should log an unavailable integration when calendar ID is missing', () => {
    const logEntry = getUnavailableIntegrationLog({ CALENDAR_ID: '' });

    expect(logEntry).toEqual(
      expect.objectContaining({
        note: 'Google Calendar integration is unavailable; application will continue running',
        reason: 'CALENDAR_ID is not configured.',
      }),
    );
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

  it('should log an unavailable integration when credentials are missing', () => {
    const logEntry = getUnavailableIntegrationLog({ GOOGLE_AUTH_JSON: '' });

    expect(logEntry).toEqual(
      expect.objectContaining({
        note: 'Google Calendar integration is unavailable; application will continue running',
        reason:
          'GOOGLE_AUTH_JSON or GOOGLE_APPLICATION_CREDENTIALS must be configured.',
      }),
    );
  });

  it('should log an unavailable integration for multiple credential sources', () => {
    const logEntry = getUnavailableIntegrationLog({
      GOOGLE_APPLICATION_CREDENTIALS: './google-auth.json',
    });

    expect(logEntry).toEqual(
      expect.objectContaining({
        note: 'Google Calendar integration is unavailable; application will continue running',
        reason:
          'Configure only one Google service account source: GOOGLE_AUTH_JSON or GOOGLE_APPLICATION_CREDENTIALS.',
      }),
    );
  });

  it('should log an unavailable integration for invalid credentials JSON', () => {
    const logEntry = getUnavailableIntegrationLog({
      GOOGLE_AUTH_JSON: '{invalid-json',
    });

    expect(logEntry).toEqual(
      expect.objectContaining({
        note: 'Google Calendar integration is unavailable; application will continue running',
        reason: 'GOOGLE_AUTH_JSON must contain valid JSON.',
      }),
    );
  });

  it('should log an unavailable integration for non-service-account credentials', () => {
    const logEntry = getUnavailableIntegrationLog({
      GOOGLE_AUTH_JSON: JSON.stringify({
        ...serviceAccountCredentials,
        type: 'authorized_user',
      }),
    });

    expect(logEntry).toEqual(
      expect.objectContaining({
        note: 'Google Calendar integration is unavailable; application will continue running',
        reason: 'GOOGLE_AUTH_JSON must contain service account credentials.',
      }),
    );
  });

  it.each(['client_email', 'private_key'] as const)(
    'should log an unavailable integration for credentials without %s',
    (field) => {
      const invalidCredentials: Record<string, unknown> = {
        ...serviceAccountCredentials,
      };
      invalidCredentials[field] = '';
      const logEntry = getUnavailableIntegrationLog({
        GOOGLE_AUTH_JSON: JSON.stringify(invalidCredentials),
      });

      expect(logEntry).toEqual(
        expect.objectContaining({
          note: 'Google Calendar integration is unavailable; application will continue running',
          reason: `GOOGLE_AUTH_JSON must contain a non-empty ${field}.`,
        }),
      );
    },
  );

  it('should log an unavailable integration for a credentials file read failure', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('file unavailable');
    });
    const logEntry = getUnavailableIntegrationLog({
      GOOGLE_AUTH_JSON: '',
      GOOGLE_APPLICATION_CREDENTIALS: './google-auth.json',
    });

    expect(logEntry).toEqual(
      expect.objectContaining({
        note: 'Google Calendar integration is unavailable; application will continue running',
        reason:
          'Failed to read the GOOGLE_APPLICATION_CREDENTIALS file: file unavailable',
      }),
    );
  });

  it('should reject event creation when the integration is unavailable', async () => {
    const unavailableProvider = new GoogleCalendarProvider(
      createConfigService({ CALENDAR_ID: '' }),
    );

    await expect(unavailableProvider.addEvent(buildEvent())).rejects.toThrow(
      'Google Calendar integration is unavailable.',
    );
  });

  it('should build a create-event URL when the integration is unavailable', () => {
    const unavailableProvider = new GoogleCalendarProvider(
      createConfigService({ CALENDAR_ID: '' }),
    );

    expect(unavailableProvider.getCreateEventUrl(buildEvent())).toContain(
      'https://calendar.google.com/calendar/render?',
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
