import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { CalendarService } from '../../calendar/calendar.service';
import { TelegramGigService } from '../../telegram/telegram-gig/telegram-gig.service';
import { GigService } from '../gig.service';
import { GigFeedService } from './gig-feed.service';
import { GIG_REPOSITORY } from '../repositories/gig.repository';
import type { GigRepository } from '../repositories/gig.repository';
import type { PlainGig } from '../types/gig.types';
import { GigSourceType } from '../types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../types/gig-source-user-origin-type.enum';
import { CommunityService } from '@modules/location/community/community.service';

function buildGig(overrides: Partial<PlainGig> = {}): PlainGig {
  return {
    id: '507f1f77bcf86cd799439011',
    communityIds: ['507f1f77bcf86cd799439022'],
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
      type: GigSourceType.User,
      userId: '507f1f77bcf86cd799439012',
      origin: { type: GigSourceUserOriginType.Admin },
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
    gigToCalendarPayload: vi.fn(),
    resolveGigPosterPublicUrl: vi.fn(),
  };
  const telegramGigService = {
    pickPost: vi.fn(),
    resolveMainPostUrl: vi.fn(),
  };
  const calendarService = { getCreateCalendarEventUrl: vi.fn() };
  const communityService = { findByRoute: vi.fn() };

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
    gigService.gigToCalendarPayload.mockReturnValue({});
    gigService.resolveGigPosterPublicUrl.mockReturnValue(undefined);
    telegramGigService.pickPost.mockReturnValue(undefined);
    telegramGigService.resolveMainPostUrl.mockResolvedValue(undefined);
    calendarService.getCreateCalendarEventUrl.mockReturnValue(
      'https://calendar.example/event',
    );
    communityService.findByRoute.mockResolvedValue({
      id: '507f1f77bcf86cd799439022',
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigFeedService,
        { provide: GIG_REPOSITORY, useValue: gigRepository },
        { provide: GigService, useValue: gigService },
        { provide: TelegramGigService, useValue: telegramGigService },
        { provide: CalendarService, useValue: calendarService },
        { provide: CommunityService, useValue: communityService },
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
      communitySlug: 'barcelona',
      countryIso: 'ES',
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
      communityId: '507f1f77bcf86cd799439022',
      limit: 10,
      direction: 'next',
    });
    expect(communityService.findByRoute).toHaveBeenCalledWith({
      countryIso: 'ES',
      communitySlug: 'barcelona',
    });
  });

  it('should reject an inverted date range before querying the repository', async () => {
    await expect(
      service.getVisibleGigDates({
        from: 20,
        to: 10,
        communitySlug: 'barcelona',
        countryIso: 'ES',
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
        communitySlug: 'barcelona',
        countryIso: 'ES',
      }),
    ).resolves.toEqual({ dates: [10, 20] });
    expect(gigRepository.findVisibleDates).toHaveBeenCalledWith({
      from: 1,
      to: 30,
      communityId: '507f1f77bcf86cd799439022',
    });
  });

  it('should query the visible Gig window by Community ID', async () => {
    await service.getVisibleGigsAround({
      anchor: 20,
      beforeLimit: 5,
      afterLimit: 6,
      communitySlug: 'barcelona',
      countryIso: 'ES',
    });

    expect(gigRepository.findVisibleAround).toHaveBeenCalledWith({
      anchor: 20,
      todayStart: expect.any(Number),
      beforeLimit: 5,
      afterLimit: 6,
      communityId: '507f1f77bcf86cd799439022',
    });
  });

  it.each([
    { community: null },
    {
      community: {
        id: '507f1f77bcf86cd799439022',
        countryIso: 'ES',
        slug: 'girona',
        nameTranslationKey: 'girona.name',
        timeZone: 'Europe/Madrid',
        isActive: false,
      },
    },
  ])(
    'should reject an unavailable Community before querying Gigs %#',
    async ({ community }) => {
      communityService.findByRoute.mockResolvedValue(community);

      await expect(
        service.getVisibleGigs({
          from: 1,
          communitySlug: 'girona',
          countryIso: 'ES',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(gigRepository.findVisiblePage).not.toHaveBeenCalled();
    },
  );

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
