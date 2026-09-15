import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as DigestMod from './digest.service';
import type {
  DigestService,
  GetPreviousDigestCronFireDateParams,
} from './digest.service';
import { DigestPublicationState } from './digest-publication-state.schema';
import { Gig } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { GigPosterService } from '../gig/gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';

describe('getPreviousDigestCronFireDate', () => {
  it('should return the prior weekly instant for default Monday-noon digest cron', () => {
    const params: GetPreviousDigestCronFireDateParams = {
      cronExpression: '0 12 * * 1',
      timeZone: 'Europe/Madrid',
      now: new Date('2024-06-12T08:00:00.000Z'),
    };

    expect(
      DigestMod.getPreviousEstimatedDigestCronFireDate(params).toISOString(),
    ).toBe('2024-06-10T10:00:00.000Z');
  });
});

describe('DigestService', () => {
  let service: DigestService;

  const execMock = vi.fn();
  const sortMock = vi.fn().mockReturnValue({ exec: execMock });
  const collationMock = vi.fn().mockReturnValue({ sort: sortMock });
  const findMock = vi.fn().mockReturnValue({ collation: collationMock });
  const publishWeeklyDigestToMainChannelMock = vi.fn();

  const findPublicationOneExec = vi.fn();
  const findPublicationOneAndUpdateExec = vi.fn();
  const findPublicationOneAndUpdateMock = vi.fn();

  let previousDigestCronFireSpy: ReturnType<typeof vi.spyOn>;

  const digestPublishSuccess = {
    postUrl: 'https://t.me/c/1/42',
  };

  const lastDigestCronFire = new Date('2024-06-10T10:00:00.000Z');

  beforeEach(async () => {
    vi.clearAllMocks();
    execMock.mockResolvedValue([]);
    publishWeeklyDigestToMainChannelMock.mockResolvedValue(
      digestPublishSuccess,
    );
    findPublicationOneExec.mockResolvedValue(null);
    findPublicationOneAndUpdateExec.mockResolvedValue({});
    findPublicationOneAndUpdateMock.mockReturnValue({
      exec: findPublicationOneAndUpdateExec,
    });

    previousDigestCronFireSpy = vi
      .spyOn(DigestMod, 'getPreviousEstimatedDigestCronFireDate')
      .mockReturnValue(lastDigestCronFire);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestMod.DigestService,
        GigService,
        {
          provide: getModelToken(Gig.name),
          useValue: {
            find: findMock,
          },
        },
        {
          provide: AiService,
          useValue: {
            lookupGigV1: vi.fn(),
          },
        },
        { provide: CalendarService, useValue: {} },
        { provide: GigPosterService, useValue: { upload: vi.fn() } },
        {
          provide: TelegramService,
          useValue: {
            publishWeeklyDigestToMainChannel:
              publishWeeklyDigestToMainChannelMock,
          },
        },
        { provide: BucketService, useValue: {} },
        {
          provide: getModelToken(DigestPublicationState.name),
          useValue: {
            findOne: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({ exec: findPublicationOneExec }),
            }),
            findOneAndUpdate: findPublicationOneAndUpdateMock,
          },
        },
      ],
    }).compile();

    service = module.get<DigestService>(DigestMod.DigestService);
  });

  afterEach(() => {
    previousDigestCronFireSpy.mockRestore();
  });

  it('should be defined when dependencies resolve', () => {
    expect(service).toBeDefined();
  });

  describe('publishIfEligible', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 10, 12, 0, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should skip publish when now is past the catch-up grace window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-11T10:00:00.000Z'));

      await service.publishIfEligible();

      expect(findMock).not.toHaveBeenCalled();
      expect(publishWeeklyDigestToMainChannelMock).not.toHaveBeenCalled();
    });

    it('should query visible gigs within the seven-day inclusive date range for today', async () => {
      const fromMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
      const toMs = new Date(2024, 5, 16, 23, 59, 59, 999).getTime();

      await service.publishIfEligible();

      expect(findMock).toHaveBeenCalledWith({
        isVisible: true,
        date: { $gte: fromMs, $lte: toMs },
      });
      expect(collationMock).toHaveBeenCalledWith({
        locale: 'en',
        strength: 2,
      });
      expect(sortMock).toHaveBeenCalledWith({ date: 1, _id: 1 });
    });

    it('should invoke Telegram digest publish with an empty document list when digest date range has no documents', async () => {
      await service.publishIfEligible();

      expect(publishWeeklyDigestToMainChannelMock).toHaveBeenCalledWith([]);
    });

    it('should invoke Telegram digest publish with loaded documents when digest date range returns documents', async () => {
      const docA = { _id: 'a', publicId: 'gig-a' };
      const docB = { _id: 'b', publicId: 'gig-b' };
      execMock.mockResolvedValue([docA, docB]);

      await service.publishIfEligible();

      expect(publishWeeklyDigestToMainChannelMock).toHaveBeenCalledWith([
        docA,
        docB,
      ]);
    });

    it('should skip gig query and Telegram when publication is already at or after the implied cron instant', async () => {
      findPublicationOneExec.mockResolvedValue({
        publishedAt: new Date(lastDigestCronFire.getTime() + 60_000),
      });

      await service.publishIfEligible();

      expect(findMock).not.toHaveBeenCalled();
      expect(publishWeeklyDigestToMainChannelMock).not.toHaveBeenCalled();
      expect(findPublicationOneAndUpdateMock).not.toHaveBeenCalled();
    });

    it('should not record publication state when digest publish returns undefined', async () => {
      publishWeeklyDigestToMainChannelMock.mockResolvedValue(undefined);

      await service.publishIfEligible();

      expect(findPublicationOneAndUpdateMock).not.toHaveBeenCalled();
    });

    it('should record publication state with post URL when Telegram digest publish succeeds', async () => {
      await service.publishIfEligible();

      expect(findPublicationOneAndUpdateMock).toHaveBeenCalledWith(
        {},
        {
          $set: {
            publishedAt: expect.any(Date),
            postUrl: digestPublishSuccess.postUrl,
          },
        },
        { upsert: true },
      );
    });

    it('should publish when within grace after cron instant and no publication recorded', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-10T11:00:00.000Z'));

      await service.publishIfEligible();

      expect(findMock).toHaveBeenCalled();
      expect(publishWeeklyDigestToMainChannelMock).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should publish when now is past the catch-up grace window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-11T10:00:00.000Z'));

      await service.publish();

      expect(findMock).toHaveBeenCalled();
      expect(publishWeeklyDigestToMainChannelMock).toHaveBeenCalled();
    });

    it('should publish without reading publication eligibility state when a digest was already recorded this cron cycle', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 10, 12, 0, 0, 0));
      findPublicationOneExec.mockResolvedValue({
        publishedAt: new Date(lastDigestCronFire.getTime() + 60_000),
      });

      await service.publish();

      expect(findPublicationOneExec).not.toHaveBeenCalled();
      expect(findMock).toHaveBeenCalled();
      expect(publishWeeklyDigestToMainChannelMock).toHaveBeenCalled();
    });
  });
});
