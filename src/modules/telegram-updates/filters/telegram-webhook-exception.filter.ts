import {
  ArgumentsHost,
  Catch,
  ConsoleLogger,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isAxiosError } from 'axios';

/**
 * Telegram webhook MUST always respond 200, otherwise Telegram retries.
 *
 * This filter is intended to be applied on the webhook route only.
 */
@Catch()
@Injectable()
export class TelegramWebhookExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ConsoleLogger) {
    this.logger.setContext(TelegramWebhookExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const axiosPart = isAxiosError(exception)
      ? {
          code: exception.code,
          status: exception.response?.status ?? null,
          message: exception.message,
          request: {
            method: exception.config?.method,
            url: exception.config?.url,
            // baseURL: exception.config?.baseURL,
            timeout: exception.config?.timeout,
          },
          response: {
            data: exception.response?.data ?? null,
          },
        }
      : undefined;

    // Keep logs, but never trigger Telegram retries.
    this.logger.error(
      {
        note: 'Telegram webhook error suppressed (responding 200)',
        status:
          exception instanceof HttpException
            ? exception.getStatus()
            : undefined,
        message:
          exception instanceof HttpException
            ? exception.getResponse()
            : 'Unknown error occurred.',
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        ...axiosPart,
      },
      exception instanceof Error ? exception.stack : undefined,
      TelegramWebhookExceptionFilter.name,
    );

    response.status(200).send();
  }
}
