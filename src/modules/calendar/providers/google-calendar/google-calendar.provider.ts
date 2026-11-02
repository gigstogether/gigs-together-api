import { Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auth, calendar } from '@googleapis/calendar';
import type { calendar_v3 } from '@googleapis/calendar';
import * as fs from 'fs';
import { getConfigString } from '@shared/utils/env';
import { formatErrorMessage } from '@shared/utils/logging';
import { isRecord } from '@shared/utils/is-record';
import { AlertSeverity } from '@modules/alerting/alert-delivery';
import type {
  AlertAttributeValue,
  AlertDefinition,
} from '@modules/alerting/alert-delivery';
import {
  AlertingService,
  AlertLogLevel,
} from '@modules/alerting/alerting.service';
import { CalendarEventCreationError } from '../../calendar.errors';
import type { CalendarEventCreationErrorParams } from '../../calendar.errors';
import type { CalendarEvent } from '../../calendar.types';
import type { CalendarProvider } from '../calendar.provider';
import { getGoogleCalendarErrorMetadata } from './google-calendar.error';

// Scope for full calendar access.
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const GOOGLE_CALENDAR_CONNECTION_TIMEOUT_MS = 10_000; // 10 seconds
const GOOGLE_CALENDAR_CONFIGURATION_INVALID_ALERT = {
  code: 'googleCalendarConfigurationInvalid',
  severity: AlertSeverity.Warning,
  summary: 'Google Calendar integration configuration is invalid.',
} satisfies AlertDefinition;
const GOOGLE_CALENDAR_CONNECTION_CHECK_FAILED_ALERT = {
  code: 'googleCalendarConnectionCheckFailed',
  severity: AlertSeverity.Warning,
  summary: 'The application cannot access the configured Google Calendar.',
} satisfies AlertDefinition;

type GoogleCalendarConfigurationIssue =
  'calendarIdMissing' | 'credentialsInvalid';

interface GoogleServiceAccountCredentials {
  type: 'service_account';
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

interface ReadyGoogleCalendarIntegration {
  status: 'ready';
  calendar: calendar_v3.Calendar;
  calendarId: string;
}

interface UnavailableGoogleCalendarIntegration {
  status: 'unavailable';
  configurationIssue: GoogleCalendarConfigurationIssue;
  reason: string;
}

type GoogleCalendarIntegration =
  ReadyGoogleCalendarIntegration | UnavailableGoogleCalendarIntegration;

class GoogleCalendarConfigurationError extends Error {}

function getRequiredServiceAccountField(
  value: Record<string, unknown>,
  field: 'client_email' | 'private_key',
  sourceName: string,
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
    throw new GoogleCalendarConfigurationError(
      `${sourceName} must contain a non-empty ${field}.`,
    );
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
    throw new GoogleCalendarConfigurationError(
      `${sourceName} must contain valid JSON.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new GoogleCalendarConfigurationError(
      `${sourceName} must contain a JSON object.`,
    );
  }
  if (parsed.type !== 'service_account') {
    throw new GoogleCalendarConfigurationError(
      `${sourceName} must contain service account credentials.`,
    );
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
    throw new GoogleCalendarConfigurationError(
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
    throw new GoogleCalendarConfigurationError(
      'GOOGLE_AUTH_JSON or GOOGLE_APPLICATION_CREDENTIALS must be configured.',
    );
  }

  let serializedCredentials: string;
  try {
    serializedCredentials = fs.readFileSync(credentialsFilePath, 'utf8');
  } catch (e) {
    throw new GoogleCalendarConfigurationError(
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
export class GoogleCalendarProvider
  implements CalendarProvider, OnApplicationBootstrap
{
  private readonly integration: GoogleCalendarIntegration;

  constructor(
    configService: ConfigService,
    private readonly alertingService: AlertingService,
  ) {
    const calendarId = getConfigString(configService, 'CALENDAR_ID');
    if (calendarId === undefined) {
      this.integration = {
        status: 'unavailable',
        configurationIssue: 'calendarIdMissing',
        reason: 'CALENDAR_ID is not configured.',
      };
      return;
    }

    let credentials: GoogleServiceAccountCredentials;
    try {
      credentials = loadGoogleServiceAccountCredentials(configService);
    } catch (e) {
      if (!(e instanceof GoogleCalendarConfigurationError)) {
        throw e;
      }
      this.integration = {
        status: 'unavailable',
        configurationIssue: 'credentialsInvalid',
        reason: e.message,
      };
      return;
    }

    const authClient = new auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      keyId: credentials.private_key_id,
      scopes: [GOOGLE_CALENDAR_SCOPE],
    });

    // Initialize Google Calendar API client
    this.integration = {
      status: 'ready',
      calendar: calendar({ version: 'v3', auth: authClient }),
      calendarId,
    };
  }

  onApplicationBootstrap(): void {
    void this.checkConnection();
  }

  /** Verify that the configured credentials can access the target calendar. */
  private async checkConnection(): Promise<void> {
    if (this.integration.status === 'unavailable') {
      await this.alertingService.reportFailureBestEffort({
        alert: {
          ...GOOGLE_CALENDAR_CONFIGURATION_INVALID_ALERT,
          attributes: {
            operation: 'initializeGoogleCalendar',
            configurationIssue: this.integration.configurationIssue,
          },
        },
        error: new GoogleCalendarConfigurationError(this.integration.reason),
        logContext: GoogleCalendarProvider.name,
        logNote:
          'Google Calendar integration is unavailable; application will continue running',
        logLevel: AlertLogLevel.Error,
        isStackTraceIncluded: false,
      });
      return;
    }

    try {
      await this.integration.calendar.calendars.get(
        { calendarId: this.integration.calendarId },
        { timeout: GOOGLE_CALENDAR_CONNECTION_TIMEOUT_MS },
      );
    } catch (e) {
      const attributes: Record<string, AlertAttributeValue> = {
        operation: 'calendars.get',
      };
      const metadata = getGoogleCalendarErrorMetadata(e);
      if (metadata.status !== undefined) {
        attributes.status = metadata.status;
      }
      if (metadata.code !== undefined) {
        attributes.code = metadata.code;
      }
      if (metadata.hint !== undefined) {
        attributes.hint = metadata.hint;
      }

      await this.alertingService.reportFailureBestEffort({
        alert: {
          ...GOOGLE_CALENDAR_CONNECTION_CHECK_FAILED_ALERT,
          attributes,
        },
        error: e,
        logContext: GoogleCalendarProvider.name,
        logNote: 'Google Calendar connection check failed',
        logLevel: AlertLogLevel.Error,
        isStackTraceIncluded: false,
      });
    }
  }

  /** Add a new event to Google Calendar. */
  async addEvent(event: CalendarEvent): Promise<void> {
    if (this.integration.status === 'unavailable') {
      throw new CalendarEventCreationError({
        message: 'Google Calendar integration is unavailable.',
        cause: new GoogleCalendarConfigurationError(this.integration.reason),
        provider: 'googleCalendar',
        providerOperation: 'events.insert',
      });
    }

    try {
      await this.integration.calendar.events.insert({
        calendarId: this.integration.calendarId,
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
      const metadata = getGoogleCalendarErrorMetadata(e);
      const errorParams: CalendarEventCreationErrorParams = {
        message: `Google Calendar event creation failed: ${formatErrorMessage(e)}`,
        cause: e,
        provider: 'googleCalendar',
        providerOperation: 'events.insert',
      };
      if (metadata.status !== undefined) {
        errorParams.status = metadata.status;
      }
      if (metadata.code !== undefined) {
        errorParams.code = metadata.code;
      }
      if (metadata.hint !== undefined) {
        errorParams.hint = metadata.hint;
      }
      throw new CalendarEventCreationError(errorParams);
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
