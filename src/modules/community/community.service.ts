import { Inject, Injectable } from '@nestjs/common';
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
      await this.assertCountriesExist([community]);
    }

    return community;
  }

  async findByIds(ids: string[]): Promise<readonly Community[]> {
    const communities = await this.communityRepository.findByIds(ids);
    await this.assertCountriesExist(communities);

    return communities;
  }

  async findByRoute(
    params: FindCommunityByRouteParams,
  ): Promise<Community | null> {
    if (!isValidCommunitySlug(params.communitySlug)) {
      throw new Error('Community slug must be a lowercase route slug');
    }

    const hasCountry = await this.countryService.hasCountry(params.countryIso);
    if (!hasCountry) {
      return null;
    }

    return this.communityRepository.findByRoute(params);
  }

  async findActive(): Promise<readonly Community[]> {
    const communities = await this.communityRepository.findActive();
    await this.assertCountriesExist(communities);

    return communities;
  }

  private async assertCountriesExist(
    communities: readonly Community[],
  ): Promise<void> {
    const countryIsos = new Set(
      communities.map((community) => community.countryIso),
    );

    for (const countryIso of countryIsos) {
      const hasCountry = await this.countryService.hasCountry(countryIso);
      if (!hasCountry) {
        throw new Error(
          'Community countryIso "' +
            countryIso +
            '" must reference an existing Country',
        );
      }
    }
  }
}
