import type { LoggerService } from '@nestjs/common';
import { logError, toShortJson } from '../../../../shared/utils/logging';
import { isRecord } from '../../../../shared/utils/is-record';

const GAXIOS_ERROR_SYMBOL = Symbol.for('gaxios-gaxios-error');

interface GaxiosErrorLike extends Error {
  code?: unknown;
  config?: unknown;
  response?: unknown;
  status?: unknown;
}

interface GoogleCalendarErrorLogParams {
  error: unknown;
  note: string;
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
  const { error, note } = params;
  if (!isGaxiosError(error)) {
    logError(logger, { error, note });
    return;
  }

  const config = isRecord(error.config) ? error.config : undefined;
  const response = isRecord(error.response) ? error.response : undefined;
  logger.error({
    note,
    upstream: {
      client: 'gaxios',
      code: isStringOrNumber(error.code) ? error.code : null,
      status: typeof error.status === 'number' ? error.status : null,
      message: error.message,
      request: {
        method: typeof config?.method === 'string' ? config.method : undefined,
        timeout:
          typeof config?.timeout === 'number' ? config.timeout : undefined,
      },
      response: {
        data: toShortJson(response?.data ?? null),
      },
    },
    timestamp: new Date().toISOString(),
  });
}
