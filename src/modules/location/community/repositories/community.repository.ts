import type { Community } from '../types/community.types';

export const COMMUNITY_REPOSITORY = Symbol('COMMUNITY_REPOSITORY');

export interface FindCommunityByRouteParams {
  countryIso: string;
  communitySlug: string;
}

export interface CommunityRepository {
  findById(id: string): Promise<Community | null>;

  findByRoute(params: FindCommunityByRouteParams): Promise<Community | null>;

  findActive(): Promise<readonly Community[]>;
}
