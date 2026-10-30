import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConfigString } from '../../../shared/utils/env';

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
  path: string | undefined;
}

@Injectable()
export class GigFeedRevalidationService {
  private readonly logger = new Logger(GigFeedRevalidationService.name);
  private readonly appBaseUrl: string | undefined;
  private readonly revalidationSecret: string | undefined;

  constructor(configService: ConfigService) {
    this.appBaseUrl = getConfigString(configService, 'APP_BASE_URL');
    this.revalidationSecret = getConfigString(
      configService,
      'FEED_REVALIDATE_SECRET',
    );
  }

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
    if (
      this.appBaseUrl === undefined ||
      this.revalidationSecret === undefined
    ) {
      throw new ServiceUnavailableException(
        'Gig feed revalidation service is not configured',
      );
    }

    if (!/^https?:\/\//i.test(this.appBaseUrl)) {
      this.logger.warn(
        `APP_BASE_URL must be an absolute http(s) URL for Gig feed revalidation (got "${this.appBaseUrl}")`,
      );
      throw new ServiceUnavailableException(
        'Gig feed revalidation service is not configured correctly',
      );
    }

    const url = new URL('/api/revalidate/feed', this.appBaseUrl).toString();
    let path: string | undefined;
    if (params.country && params.city) {
      path = this.buildGigFeedPath({
        country: params.country,
        city: params.city,
      });
    }

    await this.postGigFeedRevalidationRequest({ url, path });
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
    if (!this.revalidationSecret) {
      this.logger.warn('FEED_REVALIDATE_SECRET is not set');
      return;
    }
    const { url, path } = params;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.revalidationSecret,
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
