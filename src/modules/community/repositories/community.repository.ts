import type { Community, CommunityData } from '../types/community.types';

export const COMMUNITY_REPOSITORY = Symbol('COMMUNITY_REPOSITORY');

export interface FindCommunityByRouteParams {
  countryIso: string;
  communitySlug: string;
}

export interface UpdateCommunityRecordParams {
  id: string;
  data: CommunityData;
  expected: CommunityData;
}

export interface CommunityRepository {
  create(data: CommunityData): Promise<Community>;

  findAll(): Promise<Community[]>;

  update(params: UpdateCommunityRecordParams): Promise<Community | null>;

  findById(id: string): Promise<Community | null>;

  findByIds(ids: string[]): Promise<readonly Community[]>;

  findByRoute(params: FindCommunityByRouteParams): Promise<Community | null>;

  findActive(): Promise<readonly Community[]>;
}
