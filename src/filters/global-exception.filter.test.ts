import type { ArgumentsHost } from '@nestjs/common';
import { ConsoleLogger, HttpStatus } from '@nestjs/common';
import { Error as MongooseError, Types } from 'mongoose';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('should log Mongoose validation failures without a stack trace', () => {
    const communityId = '6aebb1ca69f8e3833ff8d1d6';
    const logger = new ConsoleLogger();
    vi.spyOn(logger, 'setContext').mockImplementation(() => undefined);
    const loggerError = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const request = {
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/v1/admin/gig-candidates/candidate-id/approve',
      socket: {},
      url: '/v1/admin/gig-candidates/candidate-id/approve',
    };
    // Nest creates ArgumentsHost at runtime; this focused double covers only the HTTP methods used here.
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
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
});
