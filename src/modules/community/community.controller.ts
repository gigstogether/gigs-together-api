import { Controller, Get, Version } from '@nestjs/common';
import { CommunityService } from './community.service';
import type { Community } from './types/community.types';
import type {
  V1CommunityListItemResponseBody,
  V1CommunityListResponseBody,
} from './types/requests/v1-community-list-response';

const COMMUNITY_NAME_TRANSLATION_NAMESPACE = 'community';

@Controller('communities')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Version('1')
  @Get()
  async getCommunitiesV1(): Promise<V1CommunityListResponseBody> {
    const communities = await this.communityService.findActive();

    return mapV1CommunityListResponse(communities);
  }
}

function mapV1CommunityListResponse(
  communities: readonly Community[],
): V1CommunityListResponseBody {
  return {
    nameTranslationNamespace: COMMUNITY_NAME_TRANSLATION_NAMESPACE,
    communities: communities.map(mapV1CommunityListItemResponse),
  };
}

function mapV1CommunityListItemResponse(
  community: Community,
): V1CommunityListItemResponseBody {
  return {
    id: community.id,
    countryIso: community.countryIso,
    slug: community.slug,
    nameTranslationKey: community.nameTranslationKey,
    timeZone: community.timeZone,
  };
}
