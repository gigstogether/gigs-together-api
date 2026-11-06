import { Inject, Injectable } from '@nestjs/common';
import {
  isValidCommunityCountryIso,
  isValidCommunitySlug,
} from './community.validators';
import { COMMUNITY_REPOSITORY } from './repositories/community.repository';
import type { CommunityRepository } from './repositories/community.repository';
import type { Community } from './types/community.types';

export interface FindCommunityByRouteParams {
  countryIso: string;
  communitySlug: string;
}

@Injectable()
export class CommunityService {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  findById(id: string): Promise<Community | null> {
    return this.communityRepository.findById(id);
  }

  findByIds(ids: string[]): Promise<readonly Community[]> {
    return this.communityRepository.findByIds(ids);
  }

  findByRoute(params: FindCommunityByRouteParams): Promise<Community | null> {
    if (!isValidCommunityCountryIso(params.countryIso)) {
      throw new Error(
        'Community countryIso must be an uppercase ISO 3166-1 alpha-2 code',
      );
    }
    if (!isValidCommunitySlug(params.communitySlug)) {
      throw new Error('Community slug must be a lowercase route slug');
    }

    return this.communityRepository.findByRoute(params);
  }

  findActive(): Promise<readonly Community[]> {
    return this.communityRepository.findActive();
  }
}
