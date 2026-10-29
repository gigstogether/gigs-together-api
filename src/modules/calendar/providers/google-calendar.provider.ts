import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auth, calendar } from '@googleapis/calendar';
import type { calendar_v3 } from '@googleapis/calendar';
import * as fs from 'fs';
import {
  getConfigString,
  getRequiredConfigString,
} from '../../../shared/utils/env';
import { formatErrorMessage, logError } from '../../../shared/utils/logging';
import { isRecord } from '../../../shared/utils/is-record';
import type { CalendarEvent } from '../calendar.types';
import type { CalendarProvider } from './calendar.provider';

// Scope for full calendar access.
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

interface GoogleServiceAccountCredentials {
  type: 'service_account';
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

function getRequiredServiceAccountField(
  value: Record<string, unknown>,
  field: 'client_email' | 'private_key',
  sourceName: string,
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
    throw new Error(`${sourceName} must contain a non-empty ${field}.`);
  }
  return field === 'client_email' ? fieldValue.trim() : fieldValue;
}

function parseGoogleServiceAccountCredentials(
  serializedCredentials: string,
  sourceName: string,
): GoogleServiceAccountCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedCredentials);
  } catch {
    throw new Error(`${sourceName} must contain valid JSON.`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${sourceName} must contain a JSON object.`);
  }
  if (parsed.type !== 'service_account') {
    throw new Error(`${sourceName} must contain service account credentials.`);
  }

  const credentials: GoogleServiceAccountCredentials = {
    type: 'service_account',
    client_email: getRequiredServiceAccountField(
      parsed,
      'client_email',
      sourceName,
    ),
    private_key: getRequiredServiceAccountField(
      parsed,
      'private_key',
      sourceName,
    ),
  };
  if (
    typeof parsed.private_key_id === 'string' &&
    parsed.private_key_id.trim() !== ''
  ) {
    credentials.private_key_id = parsed.private_key_id.trim();
  }
  return credentials;
}

function decodeGoogleAuthJson(raw: string): string {
  if (raw.startsWith('{')) {
    return raw;
  }
  return Buffer.from(raw, 'base64').toString('utf8');
}

function loadGoogleServiceAccountCredentials(
  configService: ConfigService,
): GoogleServiceAccountCredentials {
  const rawCredentials = getConfigString(configService, 'GOOGLE_AUTH_JSON');
  const credentialsFilePath = getConfigString(
    configService,
    'GOOGLE_APPLICATION_CREDENTIALS',
  );

  if (rawCredentials !== undefined && credentialsFilePath !== undefined) {
    throw new Error(
      'Configure only one Google service account source: GOOGLE_AUTH_JSON or GOOGLE_APPLICATION_CREDENTIALS.',
    );
  }
  if (rawCredentials !== undefined) {
    return parseGoogleServiceAccountCredentials(
      decodeGoogleAuthJson(rawCredentials),
      'GOOGLE_AUTH_JSON',
    );
  }
  if (credentialsFilePath === undefined) {
    throw new Error(
      'GOOGLE_AUTH_JSON or GOOGLE_APPLICATION_CREDENTIALS must be configured.',
    );
  }

  let serializedCredentials: string;
  try {
    serializedCredentials = fs.readFileSync(credentialsFilePath, 'utf8');
  } catch (e) {
    throw new Error(
      `Failed to read the GOOGLE_APPLICATION_CREDENTIALS file: ${formatErrorMessage(e)}`,
    );
  }
  return parseGoogleServiceAccountCredentials(
    serializedCredentials,
    'GOOGLE_APPLICATION_CREDENTIALS file',
  );
}

function formatGoogleCalendarUrlDateTime(localDateTime: string): string {
  // Append Z only for validation so Date parses the components as UTC rather
  // than in the server's local time zone.
  const validationDate = new Date(`${localDateTime}Z`);
  // Round-trip through canonical ISO to reject normalized invalid dates and
  // non-canonical input without changing the event's actual time zone.
  const isValid =
    !Number.isNaN(validationDate.getTime()) &&
    validationDate.toISOString().slice(0, 19) === localDateTime;

  if (!isValid) {
    throw new Error(
      'Google Calendar local date-time must be a valid YYYY-MM-DDTHH:mm:ss value',
    );
  }

  // Google Calendar template URLs require the compact YYYYMMDDTHHmmss format.
  return localDateTime.replaceAll('-', '').replaceAll(':', '');
}

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  private readonly calendar: calendar_v3.Calendar;
  private readonly calendarId: string;
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  constructor(configService: ConfigService) {
    this.calendarId = getRequiredConfigString(configService, 'CALENDAR_ID');
    const credentials = loadGoogleServiceAccountCredentials(configService);

    const authClient = new auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      keyId: credentials.private_key_id,
      scopes: [GOOGLE_CALENDAR_SCOPE],
    });

    // Initialize Google Calendar API client
    this.calendar = calendar({ version: 'v3', auth: authClient });
  }

  /** Add a new event to Google Calendar. */
  async addEvent(event: CalendarEvent): Promise<void> {
    try {
      await this.calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: {
          colorId: '5',
          summary: event.title,
          description: event.description,
          location: event.location,
          start: {
            dateTime: event.startLocalDateTime,
            timeZone: event.timeZone,
          },
          end: {
            dateTime: event.endLocalDateTime,
            timeZone: event.timeZone,
          },
        },
      });
    } catch (e) {
      logError(this.logger, {
        error: e,
        note: 'Google Calendar event creation failed',
      });
      throw new Error('Failed to create calendar event.');
    }
  }

  /** Build a Google Calendar URL that opens the user's add-event UI. */
  getCreateEventUrl(event: CalendarEvent): string {
    const startDate = formatGoogleCalendarUrlDateTime(event.startLocalDateTime);
    const endDate = formatGoogleCalendarUrlDateTime(event.endLocalDateTime);

    const searchParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${startDate}/${endDate}`,
      details: event.description,
      location: event.location,
      ctz: event.timeZone,
    });

    return `https://calendar.google.com/calendar/render?${searchParams.toString()}`;
  }
}
