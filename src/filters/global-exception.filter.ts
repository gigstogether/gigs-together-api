import {
  ArgumentsHost,
  Catch,
  ConsoleLogger,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { Request, Response } from 'express';
import { Error as MongooseError, Types } from 'mongoose';
import { logError } from '@shared/utils/logging';

interface ObjectIdArrayValidationDetail {
  path: string;
  objectIds: string[];
  duplicateObjectIds: string[];
  valueCount: number;
  uniqueCount: number;
}

function toObjectIdString(value: unknown): string | undefined {
  if (value instanceof Types.ObjectId) {
    return value.toHexString();
  }

  if (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)) {
    return value.toLowerCase();
  }

  return undefined;
}

function getObjectIdArrayValidationDetails(
  exception: MongooseError.ValidationError,
): ObjectIdArrayValidationDetail[] {
  return Object.values(exception.errors).flatMap((validationError) => {
    if (!Array.isArray(validationError.value)) {
      return [];
    }

    const objectIds = validationError.value.map(toObjectIdString);
    if (objectIds.some((objectId) => objectId === undefined)) {
      return [];
    }

    const definedObjectIds = objectIds.filter(
      (objectId) => objectId !== undefined,
    );
    const uniqueObjectIds = new Set<string>();
    const duplicateObjectIds = new Set<string>();
    for (const objectId of definedObjectIds) {
      if (uniqueObjectIds.has(objectId)) {
        duplicateObjectIds.add(objectId);
      } else {
        uniqueObjectIds.add(objectId);
      }
    }

    return [
      {
        path: validationError.path,
        objectIds: definedObjectIds,
        duplicateObjectIds: [...duplicateObjectIds],
        valueCount: definedObjectIds.length,
        uniqueCount: uniqueObjectIds.size,
      },
    ];
  });
}

function getClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  const socketAddr = request.socket?.remoteAddress;
  if (socketAddr) {
    return socketAddr;
  }
  return request.ip ?? 'unknown';
}

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ConsoleLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (isAxiosError(exception)) {
      logError(this.logger, {
        error: exception,
        note: 'Upstream Axios request failed',
        context: GlobalExceptionFilter.name,
        meta: {
          request: {
            path: request.url,
            method: request.method,
          },
        },
      });

      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        message: 'Internal server error',
      });
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawMessage =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message:
        typeof rawMessage === 'string'
          ? rawMessage
          : (rawMessage as { message?: string }).message || 'An error occurred',
      ...(typeof rawMessage === 'object' && !(rawMessage instanceof Error)
        ? rawMessage
        : {}),
    };

    const pathForLog = request.originalUrl ?? request.url;
    const clientIp = getClientIp(request);

    if (status === HttpStatus.UNAUTHORIZED) {
      return response.status(status).json(errorResponse);
    }

    if (status === HttpStatus.NOT_FOUND) {
      this.logger.warn(
        `Not found ${request.method} ${pathForLog} ip=${clientIp}`,
        GlobalExceptionFilter.name,
      );
    } else if (exception instanceof MongooseError.ValidationError) {
      this.logger.error({
        ...errorResponse,
        errorType: exception.name,
        message: exception.message,
        validationPaths: Object.keys(exception.errors),
        validationDetails: getObjectIdArrayValidationDetails(exception),
      });
    } else {
      // Keep logs readable: only message + stack (no giant object dumps).
      this.logger.error(
        errorResponse,
        exception instanceof Error ? exception.stack : undefined,
        GlobalExceptionFilter.name,
      );
    }

    return response.status(status).json(errorResponse);
  }
}
