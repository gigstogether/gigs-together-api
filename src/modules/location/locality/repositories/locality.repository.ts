import type { Locality } from '../types/locality.types';

export const LOCALITY_REPOSITORY = Symbol('LOCALITY_REPOSITORY');

export interface CreateLocalityRecordParams {
  countryIso: string;
  name: string;
  qualifier?: string;
  aliases: string[];
  timeZone: string;
}

export interface FindLocalitiesParams {
  countryIso?: string;
  search?: string;
}

export interface UpdateLocalityRecordParams {
  id: string;
  name: string;
  qualifier?: string;
  aliases: string[];
  timeZone: string;
}

export interface LocalityRepository {
  create(params: CreateLocalityRecordParams): Promise<Locality>;

  findById(id: string): Promise<Locality | null>;

  find(params: FindLocalitiesParams): Promise<readonly Locality[]>;

  update(params: UpdateLocalityRecordParams): Promise<Locality | null>;

  deleteById(id: string): Promise<boolean>;
}
