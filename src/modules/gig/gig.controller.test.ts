import { GigController } from './gig.controller';
import type { GigFeedService } from './gig-feed.service';

describe('GigController', () => {
  const gigFeedService = {
    getVisibleGigs: vi.fn(),
    getVisibleGigDates: vi.fn(),
    getVisibleGigsAround: vi.fn(),
    getVisibleGigDateByPublicId: vi.fn(),
  } satisfies Pick<
    GigFeedService,
    | 'getVisibleGigs'
    | 'getVisibleGigDates'
    | 'getVisibleGigsAround'
    | 'getVisibleGigDateByPublicId'
  >;
  const controller = new GigController(
    gigFeedService as unknown as GigFeedService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should map feed dates to the v1 string contract', async () => {
    gigFeedService.getVisibleGigs.mockResolvedValue({
      gigs: [
        {
          id: 'radiohead-2026-06-12',
          title: 'Radiohead',
          date: 1_781_264_000_000,
          endDate: 1_781_350_400_000,
          city: 'barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example',
          calendarUrl: 'https://calendar.example',
        },
      ],
      nextCursor: 'next',
    });

    await expect(
      controller.getGigsV1({
        from: 1_781_264_000_000,
        limit: 20,
        city: 'barcelona',
        country: 'ES',
      }),
    ).resolves.toEqual({
      gigs: [
        {
          id: 'radiohead-2026-06-12',
          title: 'Radiohead',
          date: '1781264000000',
          endDate: '1781350400000',
          city: 'barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example',
          calendarUrl: 'https://calendar.example',
        },
      ],
      nextCursor: 'next',
    });
    expect(gigFeedService.getVisibleGigs).toHaveBeenCalledWith({
      from: 1_781_264_000_000,
      limit: 20,
      city: 'barcelona',
      country: 'ES',
    });
  });

  it('should serialize visible Gig dates at the HTTP boundary', async () => {
    gigFeedService.getVisibleGigDates.mockResolvedValue({ dates: [10, 20] });

    await expect(
      controller.getGigDatesV1({
        from: 1,
        city: 'barcelona',
        country: 'ES',
      }),
    ).resolves.toEqual({ dates: ['10', '20'] });
  });

  it('should serialize a visible Gig anchor date at the HTTP boundary', async () => {
    gigFeedService.getVisibleGigDateByPublicId.mockResolvedValue({ date: 123 });

    await expect(
      controller.getGigDateByPublicId({ publicId: 'radiohead-2026-06-12' }),
    ).resolves.toEqual({ date: '123' });
  });
});
