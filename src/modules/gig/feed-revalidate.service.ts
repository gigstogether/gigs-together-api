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

  async revalidateFeed(params: RevalidateFeedParams): Promise<void> {
    try {
      await this.revalidateFeedOrThrow(params);
    } catch (e) {
      this.logger.warn(
        `Feed revalidate request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  revalidateFeedOrThrow(params: RevalidateFeedParams): Promise<void> {
    const baseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const secret = (process.env.FEED_REVALIDATE_SECRET ?? '').trim();
    if (!baseUrl || !secret) {
      return Promise.resolve();
    }

    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new Error(
        `APP_BASE_URL must be an absolute http(s) URL for revalidation (got "${baseUrl}")`,
      );
    }

    const url = new URL('/api/revalidate/feed', baseUrl).toString();
    let path: string | undefined;
    if (params.country && params.city) {
      path = this.buildFeedPath({
        country: params.country,
        city: params.city,
      });
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

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': secret,
      },
      body: JSON.stringify(path ? { paths: [path] } : {}),
    });

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch (e) {
        this.logger.warn(
          `Reading failed feed revalidation response failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      throw new Error(
        `Feed revalidate failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
      );
    }
  }
}
