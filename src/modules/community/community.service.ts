import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isValidCommunitySlug } from './community.validators';
import { CountryService } from '@modules/location/country/country.service';
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
    private readonly countryService: CountryService,
  ) {}

  async findById(id: string): Promise<Community | null> {
    const community = await this.communityRepository.findById(id);

    if (community !== null) {
      this.assertCountriesExist([community]);
    }

    return community;
  }

  async findByIds(ids: string[]): Promise<readonly Community[]> {
    const communities = await this.communityRepository.findByIds(ids);
    this.assertCountriesExist(communities);

    return communities;
  }

  async findByRoute(
    params: FindCommunityByRouteParams,
  ): Promise<Community | null> {
    if (!isValidCommunitySlug(params.communitySlug)) {
      throw new Error('Community slug must be a lowercase route slug');
    }

    const hasCountry = this.countryService.hasCountry(params.countryIso);
    if (!hasCountry) {
      return null;
    }

    return this.communityRepository.findByRoute(params);
  }

  async findActive(): Promise<readonly Community[]> {
    const communities = await this.communityRepository.findActive();
    this.assertCountriesExist(communities);

    return communities;
  }

  async requireActiveCommunityIds(communityIds: string[]): Promise<string[]> {
    if (communityIds.length === 0) {
      throw new BadRequestException(
        'communityIds must contain at least one Community id',
      );
    }

    const normalizedCommunityIds = communityIds.map((communityId) => {
      if (!/^[a-f\d]{24}$/i.test(communityId)) {
        throw new BadRequestException(
          'communityIds must contain valid Community ids',
        );
      }
      return communityId.toLowerCase();
    });
    if (
      new Set(normalizedCommunityIds).size !== normalizedCommunityIds.length
    ) {
      throw new BadRequestException('communityIds must not contain duplicates');
    }

    const communities = await this.findByIds(normalizedCommunityIds);
    const activeCommunityIds = new Set(
      communities
        .filter((community) => community.isActive)
        .map((community) => community.id),
    );
    if (
      normalizedCommunityIds.some(
        (communityId) => !activeCommunityIds.has(communityId),
      )
    ) {
      throw new BadRequestException(
        'communityIds must reference active Communities',
      );
    }

    return normalizedCommunityIds;
  }

  private assertCountriesExist(communities: readonly Community[]): void {
    const countryIsos = new Set(
      communities.map((community) => community.countryIso),
    );

    for (const countryIso of countryIsos) {
      const hasCountry = this.countryService.hasCountry(countryIso);
      if (!hasCountry) {
        throw new Error(
          'Community countryIso "' +
            countryIso +
            '" must be a supported ISO 3166-1 alpha-2 code',
        );
      }
    }
  }
}
