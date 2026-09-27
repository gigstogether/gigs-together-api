import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import * as DigestMod from './digest.service';
import type {
  DigestService,
  GetPreviousDigestCronFireDateParams,
} from './digest.service';
import { GigFeedService } from '../gig/gig-feed.service';
import { TelegramDigestService } from '../telegram/telegram-digest/telegram-digest.service';
import { DIGEST_POST_STATE_REPOSITORY } from './repositories/digest-post-state.repository';

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

  const getVisibleGigsInInclusiveMsRangeMock = vi.fn();
  const sendWeeklyDigestPostMock = vi.fn();
  const findCurrentDigestPostStateMock = vi.fn();
  const saveSuccessfulDigestPostMock = vi.fn();

  let previousDigestCronFireSpy: ReturnType<typeof vi.spyOn>;

  const digestPostSuccess = {
    postUrl: 'https://t.me/c/1/42',
  };

  const lastDigestCronFire = new Date('2024-06-10T10:00:00.000Z');

  beforeEach(async () => {
    vi.clearAllMocks();
    getVisibleGigsInInclusiveMsRangeMock.mockResolvedValue([]);
    sendWeeklyDigestPostMock.mockResolvedValue(digestPostSuccess);
    findCurrentDigestPostStateMock.mockResolvedValue(null);
    saveSuccessfulDigestPostMock.mockResolvedValue(undefined);

    previousDigestCronFireSpy = vi
      .spyOn(DigestMod, 'getPreviousEstimatedDigestCronFireDate')
      .mockReturnValue(lastDigestCronFire);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestMod.DigestService,
        {
          provide: GigFeedService,
          useValue: {
            getVisibleGigsInInclusiveMsRange:
              getVisibleGigsInInclusiveMsRangeMock,
          },
        },
        {
          provide: TelegramDigestService,
          useValue: {
            sendWeeklyDigestPost: sendWeeklyDigestPostMock,
          },
        },
        {
          provide: DIGEST_POST_STATE_REPOSITORY,
          useValue: {
            findCurrent: findCurrentDigestPostStateMock,
            saveSuccessfulPost: saveSuccessfulDigestPostMock,
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

      expect(getVisibleGigsInInclusiveMsRangeMock).not.toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).not.toHaveBeenCalled();
    });

    it('should query visible gigs within the seven-day inclusive date range for today', async () => {
      const fromMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
      const toMs = new Date(2024, 5, 16, 23, 59, 59, 999).getTime();

      await service.createPostIfEligible();

      expect(getVisibleGigsInInclusiveMsRangeMock).toHaveBeenCalledWith({
        fromMs,
        toMs,
      });
    });

    it('should send an empty document list when the digest date range has no documents', async () => {
      await service.createPostIfEligible();

      expect(sendWeeklyDigestPostMock).toHaveBeenCalledWith([]);
    });

    it('should send loaded documents when the digest date range has documents', async () => {
      const docA = { _id: 'a', publicId: 'gig-a' };
      const docB = { _id: 'b', publicId: 'gig-b' };
      getVisibleGigsInInclusiveMsRangeMock.mockResolvedValue([docA, docB]);

      await service.createPostIfEligible();

      expect(sendWeeklyDigestPostMock).toHaveBeenCalledWith([docA, docB]);
    });

    it('should skip gig query and Telegram when post state is at or after the implied cron instant', async () => {
      findCurrentDigestPostStateMock.mockResolvedValue({
        postedAt: new Date(lastDigestCronFire.getTime() + 60_000),
        postUrl: 'https://t.me/c/1/41',
      });

      await service.createPostIfEligible();

      expect(getVisibleGigsInInclusiveMsRangeMock).not.toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).not.toHaveBeenCalled();
      expect(saveSuccessfulDigestPostMock).not.toHaveBeenCalled();
    });

    it('should not record post state when Telegram returns undefined', async () => {
      sendWeeklyDigestPostMock.mockResolvedValue(undefined);

      await service.createPostIfEligible();

      expect(saveSuccessfulDigestPostMock).not.toHaveBeenCalled();
    });

    it('should record post state with post URL when Telegram succeeds', async () => {
      await service.createPostIfEligible();

      expect(saveSuccessfulDigestPostMock).toHaveBeenCalledWith({
        postedAt: expect.any(Date),
        postUrl: digestPostSuccess.postUrl,
      });
    });

    it('should post when within grace after cron instant and no post is recorded', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-10T11:00:00.000Z'));

      await service.createPostIfEligible();

      expect(getVisibleGigsInInclusiveMsRangeMock).toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).toHaveBeenCalled();
    });
  });

  describe('createPost', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should post when now is past the catch-up grace window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-11T10:00:00.000Z'));

      await service.createPost();

      expect(getVisibleGigsInInclusiveMsRangeMock).toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).toHaveBeenCalled();
    });

    it('should post without reading eligibility state when a digest is already recorded this cron cycle', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 10, 12, 0, 0, 0));
      findCurrentDigestPostStateMock.mockResolvedValue({
        postedAt: new Date(lastDigestCronFire.getTime() + 60_000),
        postUrl: 'https://t.me/c/1/41',
      });

      await service.createPost();

      expect(findCurrentDigestPostStateMock).not.toHaveBeenCalled();
      expect(getVisibleGigsInInclusiveMsRangeMock).toHaveBeenCalled();
      expect(sendWeeklyDigestPostMock).toHaveBeenCalled();
    });
  });
});
