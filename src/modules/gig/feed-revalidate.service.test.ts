import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { FeedRevalidateService } from './feed-revalidate.service';

describe('FeedRevalidateService', () => {
  let service: FeedRevalidateService;
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('APP_BASE_URL', '');
    vi.stubEnv('FEED_REVALIDATE_SECRET', '');

    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedRevalidateService],
    }).compile();

    service = module.get<FeedRevalidateService>(FeedRevalidateService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('buildFeedPath', () => {
    it('should build encoded feed path when country and city are provided', () => {
      expect(service.buildFeedPath({ country: 'ES', city: 'Barcelona' })).toBe(
        '/feed/es/barcelona',
      );
    });

    it('should throw when country or city is missing', () => {
      expect(() =>
        service.buildFeedPath({ country: '  ', city: 'barcelona' }),
      ).toThrow('Missing country/city for feed path');
    });
  });

  describe('revalidateFeed', () => {
    it('should skip request when revalidation env is not configured', async () => {
      await service.revalidateFeed({ country: 'ES', city: 'barcelona' });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should POST feed revalidate request when env is configured', async () => {
      vi.stubEnv('APP_BASE_URL', 'https://gigs.example');
      vi.stubEnv('FEED_REVALIDATE_SECRET', 'secret');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateFeed({ country: 'ES', city: 'barcelona' });

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
      vi.stubEnv('APP_BASE_URL', 'gigs.example');
      vi.stubEnv('FEED_REVALIDATE_SECRET', 'secret');

      await service.revalidateFeed({ country: 'ES', city: 'barcelona' });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should POST empty body when country and city are omitted', async () => {
      vi.stubEnv('APP_BASE_URL', 'https://gigs.example');
      vi.stubEnv('FEED_REVALIDATE_SECRET', 'secret');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await service.revalidateFeed({});

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

  describe('revalidateFeedOrThrow', () => {
    it('should expose request failure to an approval caller', async () => {
      vi.stubEnv('APP_BASE_URL', 'https://gigs.example');
      vi.stubEnv('FEED_REVALIDATE_SECRET', 'secret');
      fetchMock.mockRejectedValue(new Error('Network unavailable'));

      await expect(
        service.revalidateFeedOrThrow({ country: 'ES', city: 'barcelona' }),
      ).rejects.toThrow('Network unavailable');
    });
  });
});
