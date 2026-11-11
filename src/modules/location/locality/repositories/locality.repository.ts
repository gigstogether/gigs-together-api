import type { Locality } from '../types/locality.types';

export const LOCALITY_REPOSITORY = Symbol('LOCALITY_REPOSITORY');

export interface CreateLocalityRecordParams {
  regionId: string;
  name: string;
  aliases: string[];
  timeZone: string;
}

export interface FindLocalitiesParams {
  regionId?: string;
  search?: string;
}

export interface UpdateLocalityRecordParams {
  id: string;
  name: string;
  aliases: string[];
  timeZone: string;
}

export interface LocalityRepository {
  create(params: CreateLocalityRecordParams): Promise<Locality>;

  findById(id: string): Promise<Locality | null>;

  find(params: FindLocalitiesParams): Promise<readonly Locality[]>;

  existsByRegionId(regionId: string): Promise<boolean>;

  update(params: UpdateLocalityRecordParams): Promise<Locality | null>;

  deleteById(id: string): Promise<boolean>;
}
