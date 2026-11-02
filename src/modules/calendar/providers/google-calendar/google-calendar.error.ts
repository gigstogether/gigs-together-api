const GAXIOS_ERROR_SYMBOL = Symbol.for('gaxios-gaxios-error');
const GOOGLE_CALENDAR_NOT_FOUND_HINT =
  'Calendar does not exist or the service account has no access';

interface GaxiosErrorLike extends Error {
  code?: unknown;
  status?: unknown;
}

export interface GoogleCalendarErrorMetadata {
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

export function getGoogleCalendarErrorMetadata(
  error: unknown,
): GoogleCalendarErrorMetadata {
  const metadata: GoogleCalendarErrorMetadata = {};
  if (!isGaxiosError(error)) {
    return metadata;
  }

  if (typeof error.status === 'number') {
    metadata.status = error.status;
  }
  const hasDuplicateNumericCode =
    typeof error.code === 'number' && error.code === error.status;
  if (isStringOrNumber(error.code) && !hasDuplicateNumericCode) {
    metadata.code = error.code;
  }
  if (error.status === 404) {
    metadata.hint = GOOGLE_CALENDAR_NOT_FOUND_HINT;
  }
  return metadata;
}
