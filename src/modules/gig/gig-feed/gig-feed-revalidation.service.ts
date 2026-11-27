import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunityService } from '@modules/community/community.service';
import type { Community } from '@modules/community/types/community.types';
import { getConfigString } from '@shared/utils/env';

interface BuildGigFeedPathParams {
  countryIso: string;
  communitySlug: string;
}

interface RevalidateGigFeedsParams {
  communityIds?: string[];
  communityRoutes?: CommunityFeedRoute[];
  isCommunityCatalogChanged?: boolean;
}

interface CommunityFeedRoute {
  countryIso: string;
  slug: string;
}

interface PostGigFeedRevalidationRequestParams {
  url: string;
  paths: string[] | undefined;
  isCommunityCatalogChanged?: boolean;
}

interface GigFeedRevalidationRequestBody {
  paths?: string[];
  isCommunityCatalogChanged?: boolean;
}

@Injectable()
export class GigFeedRevalidationService {
  private readonly logger = new Logger(GigFeedRevalidationService.name);
  private readonly appBaseUrl: string | undefined;
  private readonly revalidationSecret: string | undefined;

  constructor(
    configService: ConfigService,
    private readonly communityService: CommunityService,
  ) {
    this.appBaseUrl = getConfigString(configService, 'APP_BASE_URL');
    this.revalidationSecret = getConfigString(
      configService,
      'FEED_REVALIDATE_SECRET',
    );
  }

  async revalidateGigFeeds(params: RevalidateGigFeedsParams): Promise<void> {
    try {
      await this.revalidateGigFeedsOrThrow(params);
    } catch (e) {
      this.logger.warn(
        `Gig feed revalidation request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  revalidateCommunityCatalog(communities: Community[]): Promise<void> {
    return this.revalidateGigFeeds({
      communityRoutes: communities.map((community) => ({
        countryIso: community.countryIso,
        slug: community.slug,
      })),
      isCommunityCatalogChanged: true,
    });
  }

  async revalidateGigFeedsOrThrow(
    params: RevalidateGigFeedsParams,
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

    if (
      params.communityIds !== undefined &&
      params.communityRoutes !== undefined
    ) {
      throw new Error(
        'Provide either Community ids or route snapshots for feed revalidation',
      );
    }

    const url = new URL('/api/revalidate/feed', this.appBaseUrl).toString();
    let paths: string[] | undefined;
    if (params.communityRoutes !== undefined) {
      paths = [
        ...new Set(
          params.communityRoutes.map((community) =>
            this.buildGigFeedPath({
              countryIso: community.countryIso,
              communitySlug: community.slug,
            }),
          ),
        ),
      ];
    }
    if (params.communityIds !== undefined) {
      if (params.communityIds.length === 0) {
        throw new Error(
          'Gig feed revalidation requires at least one Community id',
        );
      }

      const communities = await this.communityService.findByIds(
        params.communityIds,
      );
      this.assertAllCommunitiesExist(params.communityIds, communities);
      paths = communities.map((community) =>
        this.buildGigFeedPath({
          countryIso: community.countryIso,
          communitySlug: community.slug,
        }),
      );
    }

    const request: PostGigFeedRevalidationRequestParams = { url, paths };
    if (params.isCommunityCatalogChanged !== undefined) {
      request.isCommunityCatalogChanged = params.isCommunityCatalogChanged;
    }
    await this.postGigFeedRevalidationRequest(request);
  }

  buildGigFeedPath(params: BuildGigFeedPathParams): string {
    const countryIso = params.countryIso.trim().toLowerCase();
    const communitySlug = params.communitySlug.trim().toLowerCase();
    if (!countryIso || !communitySlug) {
      throw new Error('Missing countryIso/communitySlug for Gig feed path');
    }
    return `/feed/${encodeURIComponent(countryIso)}/${encodeURIComponent(communitySlug)}`;
  }

  private assertAllCommunitiesExist(
    communityIds: string[],
    communities: readonly Community[],
  ): void {
    const foundIds = new Set(communities.map((community) => community.id));
    const missingId = communityIds.find((id) => !foundIds.has(id));
    if (missingId !== undefined) {
      throw new Error(
        `Gig feed revalidation Community does not exist: ${missingId}`,
      );
    }
  }

  private async postGigFeedRevalidationRequest(
    params: PostGigFeedRevalidationRequestParams,
  ): Promise<void> {
    if (!this.revalidationSecret) {
      this.logger.warn('FEED_REVALIDATE_SECRET is not set');
      return;
    }
    const { url, paths } = params;
    const body: GigFeedRevalidationRequestBody = {};
    if (paths !== undefined) body.paths = paths;
    if (params.isCommunityCatalogChanged !== undefined)
      body.isCommunityCatalogChanged = params.isCommunityCatalogChanged;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.revalidationSecret,
        },
        body: JSON.stringify(body),
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
