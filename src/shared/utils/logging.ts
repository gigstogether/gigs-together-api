import { isAxiosError } from 'axios';
import type { LoggerService } from '@nestjs/common';

export function formatErrorMessage(e: unknown): string {
  if (!isAxiosError(e)) {
    if (e instanceof Error) {
      return e.message;
    }
    return typeof e === 'string' ? e : 'unknown error';
  }

  const parts = [e.message];
  if (e.response?.status !== undefined) {
    parts.push(`httpStatus=${e.response.status}`);
  }
  return parts.join('; ');
}

export function toShortJson(value: unknown, maxLen = 2000): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string')
    return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : value;
  } catch {
    return '[unserializable]';
  }
}

export function logError(
  logger: Pick<LoggerService, 'error'>,
  input: {
    error: unknown;
    note: string;
    context?: string;
    meta?: Record<string, unknown>;
  },
): void {
  const { error, note, context, meta } = input;

  if (isAxiosError(error)) {
    const payload = {
      note,
      ...(context ? { context } : {}),
      ...(meta ? { meta } : {}),
      upstream: {
        code: error.code,
        status: error.response?.status ?? null,
        message: error.message,
        request: {
          method: error.config?.method,
          url: error.config?.url,
          timeout: error.config?.timeout,
          params: toShortJson(error.config?.params),
        },
        response: {
          data: toShortJson(error.response?.data ?? null),
        },
      },
      timestamp: new Date().toISOString(),
    };

    // Avoid passing `undefined` as stack/trace: Nest prints it as an extra "undefined" line.
    logger.error(payload);
    return;
  }

  if (error instanceof Error) {
    const payload = {
      note,
      ...(context ? { context } : {}),
      ...(meta ? { meta } : {}),
      message: error.message,
      timestamp: new Date().toISOString(),
    };

    if (context) {
      logger.error(payload, error.stack, context);
    } else {
      logger.error(payload, error.stack);
    }
    return;
  }

  const payload = {
    note,
    ...(context ? { context } : {}),
    ...(meta ? { meta } : {}),
    message: typeof error === 'string' ? error : toShortJson(error),
    timestamp: new Date().toISOString(),
  };

  // Same reasoning: don't pass `undefined` trace.
  logger.error(payload);
}
