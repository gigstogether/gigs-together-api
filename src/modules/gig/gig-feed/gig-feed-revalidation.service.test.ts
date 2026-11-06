import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CommunityService } from '@modules/location/community/community.service';
import type { Community } from '@modules/location/community/types/community.types';

import { GigFeedRevalidationService } from './gig-feed-revalidation.service';

const BARCELONA_COMMUNITY_ID = '690a1fdb17f0a7771e9c1c21';
const GIRONA_COMMUNITY_ID = '690a1fdb17f0a7771e9c1c22';
const BARCELONA_COMMUNITY: Community = {
  id: BARCELONA_COMMUNITY_ID,
  countryIso: 'ES',
  slug: 'barcelona',
  nameTranslationKey: 'barcelona.name',
  timeZone: 'Europe/Madrid',
  isActive: true,
};
const GIRONA_COMMUNITY: Community = {
  id: GIRONA_COMMUNITY_ID,
  countryIso: 'ES',
  slug: 'girona',
  nameTranslationKey: 'girona.name',
  timeZone: 'Europe/Madrid',
  isActive: false,
};

describe('GigFeedRevalidationService', () => {
  let service: GigFeedRevalidationService;
  const fetchMock = vi.fn();
  const findCommunitiesByIdsMock = vi.fn<CommunityService['findByIds']>();

  async function createService(
    config: Record<string, unknown> = {},
  ): Promise<GigFeedRevalidationService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigFeedRevalidationService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            APP_BASE_URL: '',
            FEED_REVALIDATE_SECRET: '',
            ...config,
          }),
        },
        {
          provide: CommunityService,
          useValue: { findByIds: findCommunitiesByIdsMock },
        },
      ],
    }).compile();

    return module.get(GigFeedRevalidationService);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    findCommunitiesByIdsMock.mockResolvedValue([BARCELONA_COMMUNITY]);
    service = await createService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('buildGigFeedPath', () => {
    it('should build encoded feed path when Community route is provided', () => {
      expect(
        service.buildGigFeedPath({
          countryIso: 'ES',
          communitySlug: 'Barcelona',
        }),
      ).toBe('/feed/es/barcelona');
    });

    it('should throw when Community route is incomplete', () => {
      expect(() =>
        service.buildGigFeedPath({
          countryIso: '  ',
          communitySlug: 'barcelona',
        }),
      ).toThrow('Missing countryIso/communitySlug for Gig feed path');
    });
  });

  describe('revalidateGigFeeds', () => {
    it('should skip request when revalidation env is not configured', async () => {
      await service.revalidateGigFeeds({
        communityIds: [BARCELONA_COMMUNITY_ID],
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(findCommunitiesByIdsMock).not.toHaveBeenCalled();
    });

    it('should POST all assigned Community feed paths when env is configured', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      findCommunitiesByIdsMock.mockResolvedValue([
        BARCELONA_COMMUNITY,
        GIRONA_COMMUNITY,
      ]);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateGigFeeds({
        communityIds: [BARCELONA_COMMUNITY_ID, GIRONA_COMMUNITY_ID],
      });

      expect(findCommunitiesByIdsMock).toHaveBeenCalledWith([
        BARCELONA_COMMUNITY_ID,
        GIRONA_COMMUNITY_ID,
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://gigs.example/api/revalidate/feed',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-revalidate-secret': 'secret',
          },
          body: JSON.stringify({
            paths: ['/feed/es/barcelona', '/feed/es/girona'],
          }),
        },
      );
    });

    it('should skip request when APP_BASE_URL is not absolute http(s)', async () => {
      service = await createService({
        APP_BASE_URL: 'gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });

      await service.revalidateGigFeeds({
        communityIds: [BARCELONA_COMMUNITY_ID],
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(findCommunitiesByIdsMock).not.toHaveBeenCalled();
    });

    it('should POST empty body when Community ids are omitted', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateGigFeeds({});

      expect(findCommunitiesByIdsMock).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://gigs.example/api/revalidate/feed',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-revalidate-secret': 'secret',
          },
          body: JSON.stringify({}),
        },
      );
    });
  });

  describe('revalidateGigFeedsOrThrow', () => {
    it('should reject when revalidation env is not configured', async () => {
      await expect(
        service.revalidateGigFeedsOrThrow({}),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should reject an explicit empty Community assignment', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });

      await expect(
        service.revalidateGigFeedsOrThrow({ communityIds: [] }),
      ).rejects.toThrow(
        'Gig feed revalidation requires at least one Community id',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject when an assigned Community does not exist', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      findCommunitiesByIdsMock.mockResolvedValue([]);

      await expect(
        service.revalidateGigFeedsOrThrow({
          communityIds: [BARCELONA_COMMUNITY_ID],
        }),
      ).rejects.toThrow(
        `Gig feed revalidation Community does not exist: ${BARCELONA_COMMUNITY_ID}`,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should expose request failure to the caller', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      fetchMock.mockRejectedValue(new Error('Network unavailable'));

      await expect(
        service.revalidateGigFeedsOrThrow({
          communityIds: [BARCELONA_COMMUNITY_ID],
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('should reject when the frontend rejects revalidation', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('Cache unavailable'),
      });

      await expect(
        service.revalidateGigFeedsOrThrow({
          communityIds: [BARCELONA_COMMUNITY_ID],
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
