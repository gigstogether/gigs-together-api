import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  ConsoleLogger,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Error as MongooseError, Types } from 'mongoose';
import { GlobalExceptionFilter } from './global-exception.filter';

function createHttpHost(path: string, method = 'POST') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const request = {
    headers: {},
    ip: '127.0.0.1',
    method,
    originalUrl: path,
    socket: {},
    url: path,
  };
  // Nest creates ArgumentsHost at runtime; this focused double covers only the HTTP methods used here.
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('GlobalExceptionFilter', () => {
  it('should log Mongoose validation failures without a stack trace', () => {
    const communityId = '6aebb1ca69f8e3833ff8d1d6';
    const logger = new ConsoleLogger();
    vi.spyOn(logger, 'setContext').mockImplementation(() => undefined);
    const loggerError = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);
    const { host, json, status } = createHttpHost(
      '/v1/admin/gig-candidates/candidate-id/approve',
    );
    const exception = new MongooseError.ValidationError();
    exception.addError(
      'gigDraft.communityIds',
      new MongooseError.ValidatorError({
        message: 'communityIds must contain unique Community ObjectIds',
        path: 'gigDraft.communityIds',
        value: [
          new Types.ObjectId(communityId),
          new Types.ObjectId(communityId),
        ],
      }),
    );
    const filter = new GlobalExceptionFilter(logger);

    filter.catch(exception, host);

    expect(loggerError).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: expect.any(String),
      path: '/v1/admin/gig-candidates/candidate-id/approve',
      method: 'POST',
      message:
        'Validation failed: gigDraft.communityIds: communityIds must contain unique Community ObjectIds',
      errorType: 'ValidationError',
      validationPaths: ['gigDraft.communityIds'],
      validationDetails: [
        {
          path: 'gigDraft.communityIds',
          objectIds: [communityId, communityId],
          duplicateObjectIds: [communityId],
          valueCount: 2,
          uniqueCount: 1,
        },
      ],
    });
    expect(loggerError.mock.calls[0]).toHaveLength(1);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: expect.any(String),
      path: '/v1/admin/gig-candidates/candidate-id/approve',
      method: 'POST',
      message: 'Internal server error',
    });
  });

  it('should log expected bad requests as warnings without a stack trace', () => {
    const logger = new ConsoleLogger();
    vi.spyOn(logger, 'setContext').mockImplementation(() => undefined);
    const loggerWarn = vi
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);
    const loggerError = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);
    const { host, json, status } = createHttpHost('/v1/gig-candidates');
    const filter = new GlobalExceptionFilter(logger);

    filter.catch(
      new BadRequestException('communityIds must not contain duplicates'),
      host,
    );

    const expectedResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      timestamp: expect.any(String),
      path: '/v1/gig-candidates',
      method: 'POST',
      message: 'communityIds must not contain duplicates',
      error: 'Bad Request',
    };
    expect(loggerWarn).toHaveBeenCalledWith(expectedResponse);
    expect(loggerWarn.mock.calls[0]).toHaveLength(1);
    expect(loggerError).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(expectedResponse);
  });

  it('should log a missing Community with request context', () => {
    const logger = new ConsoleLogger();
    vi.spyOn(logger, 'setContext').mockImplementation(() => undefined);
    const loggerWarn = vi
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);
    const { host } = createHttpHost(
      '/v1/gigs?country=es&communitySlug=missing',
      'GET',
    );
    const filter = new GlobalExceptionFilter(logger);

    filter.catch(
      new NotFoundException('Active Community "ES/missing" not found'),
      host,
    );

    expect(loggerWarn).toHaveBeenCalledWith(
      'Not found GET /v1/gigs?country=es&communitySlug=missing ip=127.0.0.1',
      GlobalExceptionFilter.name,
    );
  });
});
