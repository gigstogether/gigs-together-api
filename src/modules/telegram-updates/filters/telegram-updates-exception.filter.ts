import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  ConsoleLogger,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
@Injectable()
export class TelegramUpdatesExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ConsoleLogger) {
    this.logger.setContext(TelegramUpdatesExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message:
        typeof message === 'string'
          ? message
          : (message as { message: string }).message || 'An error occurred',
      ...(typeof message === 'object' && !(message instanceof Error)
        ? message
        : {}),
    };

    if (status === HttpStatus.UNAUTHORIZED) {
      response.status(status).json(errorResponse);
      return;
    }

    if (status >= 500) {
      this.logger.error(
        `Internal Server Error: ${JSON.stringify(errorResponse)}`,
        exception instanceof Error ? exception.stack : undefined,
        TelegramUpdatesExceptionFilter.name,
      );
    } else {
      this.logger.error(
        `Client Error: ${JSON.stringify(errorResponse)}`,
        TelegramUpdatesExceptionFilter.name,
      );
    }

    response.status(status).json(errorResponse);
  }
}
