import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import * as fs from 'fs';
import { formatErrorMessage, logError } from '../../../shared/utils/logging';
import { isRecord } from '../../../shared/utils/is-record';
import type { CalendarEvent } from '../calendar.types';
import type { CalendarProvider } from './calendar.provider';

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
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  constructor() {
    this.ensureGoogleAuthKeyFile();

    const auth = new google.auth.GoogleAuth({
      keyFile: 'google-auth.json',
      // Scope for full calendar access
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    // Initialize Google Calendar API client
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  private ensureGoogleAuthKeyFile(): void {
    const keyFile = 'google-auth.json';
    if (fs.existsSync(keyFile)) return;

    const raw = process.env.GOOGLE_AUTH_JSON ?? '';

    if (!raw) {
      throw new Error(
        `Missing "${keyFile}". Provide GOOGLE_AUTH_JSON env var so the service can create it on startup.`,
      );
    }

    const tryParseJson = (text: string): Record<string, unknown> => {
      const parsed: unknown = JSON.parse(text.trim());
      if (!isRecord(parsed)) {
        throw new Error('Google auth JSON must contain an object');
      }
      return parsed;
    };

    let json: Record<string, unknown>;
    try {
      if (raw.trim().startsWith('{')) {
        json = tryParseJson(raw);
      } else {
        // Allow base64-encoded JSON as well (common for CI/hosting providers).
        const decoded = Buffer.from(raw.trim(), 'base64').toString('utf8');
        json = tryParseJson(decoded);
      }
    } catch (e) {
      throw new Error(
        `Invalid GOOGLE_AUTH_JSON: expected JSON string or base64-encoded JSON (${formatErrorMessage(e)})`,
      );
    }

    try {
      fs.writeFileSync(keyFile, JSON.stringify(json, null, 2), {
        encoding: 'utf8',
      });
      this.logger.log(`Created ${keyFile} from env (GOOGLE_AUTH_JSON)`);
    } catch (e) {
      throw new Error(
        `Failed to write ${keyFile} from env: ${formatErrorMessage(e)}`,
      );
    }
  }

  /** Add a new event to Google Calendar. */
  async addEvent(event: CalendarEvent): Promise<void> {
    try {
      await this.calendar.events.insert({
        calendarId: process.env.CALENDAR_ID,
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
