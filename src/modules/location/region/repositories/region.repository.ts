import type { Region } from '../types/region.types';

export const REGION_REPOSITORY = Symbol('REGION_REPOSITORY');

export interface CreateRegionRecordParams {
  countryIso: string;
  name: string;
  aliases: string[];
}

export interface FindRegionsParams {
  countryIso?: string;
  search?: string;
}

export interface UpdateRegionRecordParams {
  id: string;
  name: string;
  aliases: string[];
}

export interface RegionRepository {
  create(params: CreateRegionRecordParams): Promise<Region>;

  findById(id: string): Promise<Region | null>;

  find(params: FindRegionsParams): Promise<readonly Region[]>;

  update(params: UpdateRegionRecordParams): Promise<Region | null>;

  deleteById(id: string): Promise<boolean>;
}
