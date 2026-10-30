import type { LoggerService } from '@nestjs/common';
import { logError } from '@shared/utils/logging';

const GAXIOS_ERROR_SYMBOL = Symbol.for('gaxios-gaxios-error');
const GOOGLE_CALENDAR_NOT_FOUND_HINT =
  'Calendar does not exist or the service account has no access';

interface GaxiosErrorLike extends Error {
  code?: unknown;
  status?: unknown;
}

interface GoogleCalendarErrorLogParams {
  error: unknown;
  event: string;
  operation: string;
}

interface GoogleCalendarErrorLogEntry {
  event: string;
  operation: string;
  message: string;
  status?: number;
  code?: string | number;
  hint?: string;
}

function isGaxiosError(e: unknown): e is GaxiosErrorLike {
  return e instanceof Error && GAXIOS_ERROR_SYMBOL in e;
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

export function logGoogleCalendarError(
  logger: Pick<LoggerService, 'error'>,
  params: GoogleCalendarErrorLogParams,
): void {
  const { error, event, operation } = params;
  if (!isGaxiosError(error)) {
    logError(logger, { error, note: event });
    return;
  }

  const logEntry: GoogleCalendarErrorLogEntry = {
    event,
    operation,
    message: error.message,
  };
  if (typeof error.status === 'number') {
    logEntry.status = error.status;
  }
  const hasDuplicateNumericCode =
    typeof error.code === 'number' && error.code === error.status;
  if (isStringOrNumber(error.code) && !hasDuplicateNumericCode) {
    logEntry.code = error.code;
  }
  if (error.status === 404) {
    logEntry.hint = GOOGLE_CALENDAR_NOT_FOUND_HINT;
  }

  logger.error(logEntry);
}
