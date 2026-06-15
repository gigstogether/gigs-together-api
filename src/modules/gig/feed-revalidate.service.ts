import { Injectable, Logger } from '@nestjs/common';

interface BuildFeedPathParams {
  readonly country: string;
  readonly city: string;
}

interface RevalidateFeedParams {
  readonly country?: string;
  readonly city?: string;
}

interface PostFeedRevalidateRequestParams {
  readonly url: string;
  readonly secret: string;
  readonly path: string | undefined;
}

@Injectable()
export class FeedRevalidateService {
  private readonly logger = new Logger(FeedRevalidateService.name);

  revalidateFeed(params: RevalidateFeedParams): Promise<void> {
    const baseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const secret = (process.env.FEED_REVALIDATE_SECRET ?? '').trim();
    if (!baseUrl || !secret) {
      return Promise.resolve();
    }

    if (!/^https?:\/\//i.test(baseUrl)) {
      this.logger.warn(
        `APP_BASE_URL must be an absolute http(s) URL for revalidation (got "${baseUrl}")`,
      );
      return Promise.resolve();
    }

    const url = new URL('/api/revalidate/feed', baseUrl).toString();
    let path: string | undefined;
    try {
      if (params.country && params.city) {
        path = this.buildFeedPath({
          country: params.country,
          city: params.city,
        });
      }
    } catch (e) {
      this.logger.warn(
        `Failed to build feed path for revalidation: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      path = undefined;
    }

    return this.postFeedRevalidateRequest({ url, secret, path });
  }

  buildFeedPath(params: BuildFeedPathParams): string {
    const country = params.country.trim().toLowerCase();
    const city = params.city.trim().toLowerCase();
    if (!country || !city) {
      throw new Error('Missing country/city for feed path');
    }
    return `/feed/${encodeURIComponent(country)}/${encodeURIComponent(city)}`;
  }

  private async postFeedRevalidateRequest(
    params: PostFeedRevalidateRequestParams,
  ): Promise<void> {
    const { url, secret, path } = params;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify(path ? { paths: [path] } : {}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Feed revalidate failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Feed revalidate request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
