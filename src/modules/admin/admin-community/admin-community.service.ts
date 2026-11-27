import { Injectable } from '@nestjs/common';
import { CommunityService } from '@modules/community/community.service';
import type { UpdateCommunityParams } from '@modules/community/community.service';
import type {
  Community,
  CommunityData,
} from '@modules/community/types/community.types';
import { GigFeedRevalidationService } from '@modules/gig/gig-feed/gig-feed-revalidation.service';

@Injectable()
export class AdminCommunityService {
  constructor(
    private readonly communityService: CommunityService,
    private readonly feedRevalidation: GigFeedRevalidationService,
  ) {}

  async createCommunity(data: CommunityData): Promise<Community> {
    const community = await this.communityService.createCommunity(data);
    await this.feedRevalidation.revalidateCommunityCatalog([community]);
    return community;
  }

  async updateCommunity(params: UpdateCommunityParams): Promise<Community> {
    const community = await this.communityService.updateCommunity(params);
    await this.feedRevalidation.revalidateCommunityCatalog([community]);
    return community;
  }
}
