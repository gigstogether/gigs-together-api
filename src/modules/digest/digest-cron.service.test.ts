import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AlertSeverity } from '@modules/alerting/alert-delivery';
import {
  AlertingService,
  AlertLogLevel,
} from '@modules/alerting/alerting.service';
import { DigestCronService } from './digest-cron.service';
import {
  DigestService,
  DIGEST_POST_CRON_EXPRESSION,
  DIGEST_POST_TIMEZONE,
} from './digest.service';

describe('DigestCronService', () => {
  let cronService: DigestCronService;

  const createPostIfEligibleMock = vi.fn();
  const reportFailureBestEffortMock =
    vi.fn<AlertingService['reportFailureBestEffort']>();

  beforeEach(async () => {
    vi.clearAllMocks();
    createPostIfEligibleMock.mockResolvedValue(undefined);
    reportFailureBestEffortMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestCronService,
        {
          provide: DigestService,
          useValue: {
            createPostIfEligible: createPostIfEligibleMock,
          },
        },
        {
          provide: AlertingService,
          useValue: {
            reportFailureBestEffort: reportFailureBestEffortMock,
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
      createPostIfEligibleMock.mockRejectedValueOnce(startupFailure);

      cronService.onModuleInit();
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });

      expect(reportFailureBestEffortMock).toHaveBeenCalledWith({
        alert: {
          code: 'weeklyDigestPostFailed',
          severity: AlertSeverity.Warning,
          summary: 'Weekly digest post failed.',
          attributes: {
            operation: 'createPostIfEligible',
            trigger: 'startupCatchUp',
            cronExpression: DIGEST_POST_CRON_EXPRESSION,
            timeZone: DIGEST_POST_TIMEZONE,
          },
        },
        error: startupFailure,
        logContext: DigestCronService.name,
        logNote:
          'Startup weekly digest catch-up failed; application will continue running',
        logLevel: AlertLogLevel.Error,
        isStackTraceIncluded: true,
      });
    });
  });

  describe('createWeeklyDigestPostScheduled', () => {
    it('should delegate to digest post eligibility when the scheduled handler runs', async () => {
      await cronService.createWeeklyDigestPostScheduled();

      expect(createPostIfEligibleMock).toHaveBeenCalledTimes(1);
    });

    it('should report and preserve a scheduled digest failure', async () => {
      const scheduledFailure = new Error('Digest send failed');
      createPostIfEligibleMock.mockRejectedValueOnce(scheduledFailure);

      await expect(cronService.createWeeklyDigestPostScheduled()).rejects.toBe(
        scheduledFailure,
      );
      expect(reportFailureBestEffortMock).toHaveBeenCalledWith({
        alert: {
          code: 'weeklyDigestPostFailed',
          severity: AlertSeverity.Warning,
          summary: 'Weekly digest post failed.',
          attributes: {
            operation: 'createPostIfEligible',
            trigger: 'scheduled',
            cronExpression: DIGEST_POST_CRON_EXPRESSION,
            timeZone: DIGEST_POST_TIMEZONE,
          },
        },
        error: scheduledFailure,
        logContext: DigestCronService.name,
        logNote: 'Scheduled weekly digest post failed',
        logLevel: AlertLogLevel.Error,
        isStackTraceIncluded: true,
      });
    });
  });
});
