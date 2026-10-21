import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

interface BuildGigFeedPathParams {
  country: string;
  city: string;
}

interface RevalidateGigFeedParams {
  country?: string;
  city?: string;
}

interface PostGigFeedRevalidationRequestParams {
  url: string;
  secret: string;
  path: string | undefined;
}

@Injectable()
export class GigFeedRevalidationService {
  private readonly logger = new Logger(GigFeedRevalidationService.name);

  async revalidateGigFeed(params: RevalidateGigFeedParams): Promise<void> {
    try {
      await this.revalidateGigFeedOrThrow(params);
    } catch (e) {
      this.logger.warn(
        `Gig feed revalidation request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async revalidateGigFeedOrThrow(
    params: RevalidateGigFeedParams,
  ): Promise<void> {
    const baseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const secret = (process.env.FEED_REVALIDATE_SECRET ?? '').trim();
    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException(
        'Gig feed revalidation service is not configured',
      );
    }

    if (!/^https?:\/\//i.test(baseUrl)) {
      this.logger.warn(
        `APP_BASE_URL must be an absolute http(s) URL for Gig feed revalidation (got "${baseUrl}")`,
      );
      throw new ServiceUnavailableException(
        'Gig feed revalidation service is not configured correctly',
      );
    }

    const url = new URL('/api/revalidate/feed', baseUrl).toString();
    let path: string | undefined;
    if (params.country && params.city) {
      path = this.buildGigFeedPath({
        country: params.country,
        city: params.city,
      });
    }

    await this.postGigFeedRevalidationRequest({ url, secret, path });
  }

  buildGigFeedPath(params: BuildGigFeedPathParams): string {
    const country = params.country.trim().toLowerCase();
    const city = params.city.trim().toLowerCase();
    if (!country || !city) {
      throw new Error('Missing country/city for Gig feed path');
    }
    return `/feed/${encodeURIComponent(country)}/${encodeURIComponent(city)}`;
  }

  private async postGigFeedRevalidationRequest(
    params: PostGigFeedRevalidationRequestParams,
  ): Promise<void> {
    const { url, secret, path } = params;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify(path ? { paths: [path] } : {}),
      });
    } catch (e) {
      this.logger.warn(
        `Gig feed revalidation request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new BadGatewayException(
        'Gig feed revalidation service is unavailable',
      );
    }

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch (e) {
        this.logger.warn(
          `Failed to read Gig feed revalidation error response: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      this.logger.warn(
        `Gig feed revalidation failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
      );
      throw new BadGatewayException(
        'Gig feed revalidation service rejected the request',
      );
    }
  }
}
