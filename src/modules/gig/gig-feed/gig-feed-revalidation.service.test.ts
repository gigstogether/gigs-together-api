import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GigFeedRevalidationService } from './gig-feed-revalidation.service';

describe('GigFeedRevalidationService', () => {
  let service: GigFeedRevalidationService;
  const fetchMock = vi.fn();

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
      ],
    }).compile();

    return module.get(GigFeedRevalidationService);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    service = await createService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('buildGigFeedPath', () => {
    it('should build encoded feed path when country and city are provided', () => {
      expect(
        service.buildGigFeedPath({ country: 'ES', city: 'Barcelona' }),
      ).toBe('/feed/es/barcelona');
    });

    it('should throw when country or city is missing', () => {
      expect(() =>
        service.buildGigFeedPath({ country: '  ', city: 'barcelona' }),
      ).toThrow('Missing country/city for Gig feed path');
    });
  });

  describe('revalidateGigFeed', () => {
    it('should skip request when revalidation env is not configured', async () => {
      await service.revalidateGigFeed({ country: 'ES', city: 'barcelona' });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should POST Gig feed revalidation request when env is configured', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateGigFeed({ country: 'ES', city: 'barcelona' });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://gigs.example/api/revalidate/feed',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-revalidate-secret': 'secret',
          },
          body: JSON.stringify({ paths: ['/feed/es/barcelona'] }),
        },
      );
    });

    it('should skip request when APP_BASE_URL is not absolute http(s)', async () => {
      service = await createService({
        APP_BASE_URL: 'gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });

      await service.revalidateGigFeed({ country: 'ES', city: 'barcelona' });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should POST empty body when country and city are omitted', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateGigFeed({});

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

  describe('revalidateGigFeedOrThrow', () => {
    it('should reject when revalidation env is not configured', async () => {
      await expect(service.revalidateGigFeedOrThrow({})).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should expose request failure to the caller', async () => {
      service = await createService({
        APP_BASE_URL: 'https://gigs.example',
        FEED_REVALIDATE_SECRET: 'secret',
      });
      fetchMock.mockRejectedValue(new Error('Network unavailable'));

      await expect(
        service.revalidateGigFeedOrThrow({
          country: 'ES',
          city: 'barcelona',
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
        service.revalidateGigFeedOrThrow({
          country: 'ES',
          city: 'barcelona',
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
