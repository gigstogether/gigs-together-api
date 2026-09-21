import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DigestCronService } from './digest-cron.service';
import { DigestService } from './digest.service';

describe('DigestCronService', () => {
  let cronService: DigestCronService;

  const createPostIfEligibleMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    createPostIfEligibleMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestCronService,
        {
          provide: DigestService,
          useValue: {
            createPostIfEligible: createPostIfEligibleMock,
          },
        },
      ],
    }).compile();

    cronService = module.get<DigestCronService>(DigestCronService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should trigger digest post eligibility check once', () => {
      cronService.onModuleInit();

      expect(createPostIfEligibleMock).toHaveBeenCalledTimes(1);
    });

    it('should contain a failed startup catch-up without an unhandled rejection', async () => {
      const startupFailure = new Error('Digest send failed');
      const loggerErrorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      createPostIfEligibleMock.mockRejectedValueOnce(startupFailure);

      cronService.onModuleInit();
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'Startup weekly digest catch-up failed; application will continue running',
          message: startupFailure.message,
        }),
        startupFailure.stack,
        DigestCronService.name,
      );
    });
  });

  describe('createWeeklyDigestPostScheduled', () => {
    it('should delegate to digest post eligibility when the scheduled handler runs', async () => {
      await cronService.createWeeklyDigestPostScheduled();

      expect(createPostIfEligibleMock).toHaveBeenCalledTimes(1);
    });
  });
});
