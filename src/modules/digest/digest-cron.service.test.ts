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

  describe('onModuleInit', () => {
    it('should trigger the digest post eligibility check once', () => {
      cronService.onModuleInit();

      expect(createPostIfEligibleMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('createWeeklyDigestPostScheduled', () => {
    it('should delegate to digest post eligibility when the scheduled handler runs', async () => {
      await cronService.createWeeklyDigestPostScheduled();

      expect(createPostIfEligibleMock).toHaveBeenCalledTimes(1);
    });
  });
});
