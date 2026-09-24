import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { CalendarService } from '../calendar/calendar.service';
import { TelegramService } from '../telegram/telegram.service';
import { GigFeedService } from './gig-feed.service';
import { GigService } from './gig.service';
import { GIG_REPOSITORY } from './repositories/gig.repository';
import type { GigRepository } from './repositories/gig.repository';
import type { PlainGig } from './types/gig.types';

function buildGig(overrides: Partial<PlainGig> = {}): PlainGig {
  return {
    id: '507f1f77bcf86cd799439011',
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    isVisible: true,
    version: 3,
    source: {
      type: 'user',
      userId: '507f1f77bcf86cd799439012',
      origin: { type: 'admin' },
    },
    posts: [],
    createdAt: new Date('2026-05-30T14:22:00.000Z'),
    updatedAt: new Date('2026-05-30T14:22:00.000Z'),
    ...overrides,
  };
}

describe('GigFeedService', () => {
  let service: GigFeedService;

  const gigRepository: Record<keyof GigRepository, ReturnType<typeof vi.fn>> = {
    existsByPublicId: vi.fn(),
    isPublicIdTaken: vi.fn(),
    countAll: vi.fn(),
    countVisible: vi.fn(),
    findMany: vi.fn(),
    findByPublicId: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    updateByPublicId: vi.fn(),
    updateVisibility: vi.fn(),
    appendMainPost: vi.fn(),
    updateTelegramPostFileId: vi.fn(),
    findVisibleInRange: vi.fn(),
    findVisiblePage: vi.fn(),
    findVisibleDateByPublicId: vi.fn(),
    findVisibleAround: vi.fn(),
    findVisibleDates: vi.fn(),
  };
  const gigService = {
    normalizeAndValidatePublicId: vi.fn(),
    resolvePublicPostUrl: vi.fn(),
    gigToCalendarPayload: vi.fn(),
    resolveGigPosterPublicUrl: vi.fn(),
  };
  const telegramService = { pickTgPost: vi.fn() };
  const calendarService = { getCreateCalendarEventUrl: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    gigRepository.findVisibleInRange.mockResolvedValue([]);
    gigRepository.findVisiblePage.mockResolvedValue({
      gigs: [],
      hasMore: false,
    });
    gigRepository.findVisibleAround.mockResolvedValue({
      before: [],
      after: [],
      hasPrevious: false,
      hasNext: false,
    });
    gigRepository.findVisibleDates.mockResolvedValue([]);
    gigService.normalizeAndValidatePublicId.mockImplementation(
      (publicId: string) => publicId,
    );
    gigService.resolvePublicPostUrl.mockResolvedValue(undefined);
    gigService.gigToCalendarPayload.mockReturnValue({});
    gigService.resolveGigPosterPublicUrl.mockReturnValue(undefined);
    telegramService.pickTgPost.mockReturnValue(undefined);
    calendarService.getCreateCalendarEventUrl.mockReturnValue(
      'https://calendar.example/event',
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigFeedService,
        { provide: GIG_REPOSITORY, useValue: gigRepository },
        { provide: GigService, useValue: gigService },
        { provide: TelegramService, useValue: telegramService },
        { provide: CalendarService, useValue: calendarService },
      ],
    }).compile();
    service = module.get(GigFeedService);
  });

  it('should delegate inclusive digest date bounds', async () => {
    await service.getVisibleGigsInInclusiveMsRange({ fromMs: 10, toMs: 20 });

    expect(gigRepository.findVisibleInRange).toHaveBeenCalledWith({
      from: 10,
      to: 20,
    });
  });

  it('should query and map the visible Gig page', async () => {
    const gig = buildGig();
    gigRepository.findVisiblePage.mockResolvedValue({
      gigs: [gig],
      hasMore: false,
    });

    const result = await service.getVisibleGigs({
      from: gig.date,
      limit: 10,
      city: 'barcelona',
      country: 'ES',
    });

    expect(result.gigs[0]).toEqual(
      expect.objectContaining({
        id: gig.publicId,
        title: gig.title,
        calendarUrl: 'https://calendar.example/event',
      }),
    );
    expect(result.gigs[0]).not.toHaveProperty('source');
    expect(gigRepository.findVisiblePage).toHaveBeenCalledWith({
      from: gig.date,
      city: 'barcelona',
      country: 'ES',
      limit: 10,
      direction: 'next',
    });
  });

  it('should reject an inverted date range before querying the repository', async () => {
    await expect(
      service.getVisibleGigDates({
        from: 20,
        to: 10,
        city: 'barcelona',
        country: 'ES',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gigRepository.findVisibleDates).not.toHaveBeenCalled();
  });

  it('should return repository dates as serialized values', async () => {
    gigRepository.findVisibleDates.mockResolvedValue([10, 20]);

    await expect(
      service.getVisibleGigDates({
        from: 1,
        to: 30,
        city: 'barcelona',
        country: 'ES',
      }),
    ).resolves.toEqual({ dates: [10, 20] });
  });

  it('should resolve a visible Gig anchor date by validated publicId', async () => {
    gigRepository.findVisibleDateByPublicId.mockResolvedValue(123);

    await expect(
      service.getVisibleGigDateByPublicId({
        publicId: 'radiohead-2026-06-12',
      }),
    ).resolves.toEqual({ date: 123 });
    expect(gigService.normalizeAndValidatePublicId).toHaveBeenCalledWith(
      'radiohead-2026-06-12',
    );
  });
});
