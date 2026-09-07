import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as DigestMod from './digest.service';
import type {
  DigestService,
  GetPreviousDigestCronFireDateParams,
} from './digest.service';
import { DigestPostState } from './digest-post-state.schema';
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
  const sendWeeklyDigestPostMock = vi.fn();

  const findPostStateOneExec = vi.fn();
  const findPostStateOneAndUpdateExec = vi.fn();
  const findPostStateOneAndUpdateMock = vi.fn();

  let previousDigestCronFireSpy: ReturnType<typeof vi.spyOn>;

  const digestPostSuccess = {
    postUrl: 'https://t.me/c/1/42',
  };

  const lastDigestCronFire = new Date('2024-06-10T10:00:00.000Z');

  beforeEach(async () => {
    vi.clearAllMocks();
    execMock.mockResolvedValue([]);
    sendWeeklyDigestPostMock.mockResolvedValue(digestPostSuccess);
    findPostStateOneExec.mockResolvedValue(null);
    findPostStateOneAndUpdateExec.mockResolvedValue({});
    findPostStateOneAndUpdateMock.mockReturnValue({
      exec: findPostStateOneAndUpdateExec,
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
            sendWeeklyDigestPost: sendWeeklyDigestPostMock,
          },
        },
        { provide: BucketService, useValue: {} },
        {
          provide: getModelToken(DigestPostState.name),
          useValue: {
            findOne: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({ exec: findPostStateOneExec }),
            }),
            findOneAndUpdate: findPostStateOneAndUpdateMock,
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

  describe('createPostIfEligible', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 10, 12, 0, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should skip posting when now is past the catch-up grace window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-11T10:00:00.000Z'));

      await service.createPostIfEligible();

      expect(findMock).not.toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).not.toHaveBeenCalled();
    });

    it('should query visible gigs within the seven-day inclusive date range for today', async () => {
      const fromMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
      const toMs = new Date(2024, 5, 16, 23, 59, 59, 999).getTime();

      await service.createPostIfEligible();

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

    it('should send an empty document list when the digest date range has no documents', async () => {
      await service.createPostIfEligible();

      expect(sendWeeklyDigestPostMock).toHaveBeenCalledWith([]);
    });

    it('should send loaded documents when the digest date range returns documents', async () => {
      const docA = { _id: 'a', publicId: 'gig-a' };
      const docB = { _id: 'b', publicId: 'gig-b' };
      execMock.mockResolvedValue([docA, docB]);

      await service.createPostIfEligible();

      expect(sendWeeklyDigestPostMock).toHaveBeenCalledWith([docA, docB]);
    });

    it('should skip gig query and Telegram when a post is already recorded after the cron instant', async () => {
      findPostStateOneExec.mockResolvedValue({
        postedAt: new Date(lastDigestCronFire.getTime() + 60_000),
      });

      await service.createPostIfEligible();

      expect(findMock).not.toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).not.toHaveBeenCalled();
      expect(findPostStateOneAndUpdateMock).not.toHaveBeenCalled();
    });

    it('should not record post state when Telegram returns undefined', async () => {
      sendWeeklyDigestPostMock.mockResolvedValue(undefined);

      await service.createPostIfEligible();

      expect(findPostStateOneAndUpdateMock).not.toHaveBeenCalled();
    });

    it('should record post state with its URL when Telegram succeeds', async () => {
      await service.createPostIfEligible();

      expect(findPostStateOneAndUpdateMock).toHaveBeenCalledWith(
        {},
        {
          $set: {
            postedAt: expect.any(Date),
            postUrl: digestPostSuccess.postUrl,
          },
        },
        { upsert: true },
      );
    });

    it('should create a post within grace after the cron instant when none is recorded', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-10T11:00:00.000Z'));

      await service.createPostIfEligible();

      expect(findMock).toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).toHaveBeenCalled();
    });
  });

  describe('createPost', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create a post when now is past the catch-up grace window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-11T10:00:00.000Z'));

      await service.createPost();

      expect(findMock).toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).toHaveBeenCalled();
    });

    it('should create a post without reading eligibility state when one was recorded this cron cycle', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 10, 12, 0, 0, 0));
      findPostStateOneExec.mockResolvedValue({
        postedAt: new Date(lastDigestCronFire.getTime() + 60_000),
      });

      await service.createPost();

      expect(findPostStateOneExec).not.toHaveBeenCalled();
      expect(findMock).toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).toHaveBeenCalled();
    });
  });
});
