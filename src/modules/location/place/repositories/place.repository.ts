import type { Place } from '../types/place.types';

export const PLACE_REPOSITORY = Symbol('PLACE_REPOSITORY');

export interface CreatePlaceRecordParams {
  localityId: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface FindPlacesParams {
  localityId?: string;
  search?: string;
  isActive?: boolean;
}

export interface UpdatePlaceRecordParams {
  id: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface PlaceRepository {
  create(params: CreatePlaceRecordParams): Promise<Place>;

  findById(id: string): Promise<Place | null>;

  find(params: FindPlacesParams): Promise<readonly Place[]>;

  existsByLocalityId(localityId: string): Promise<boolean>;

  update(params: UpdatePlaceRecordParams): Promise<Place | null>;

  deleteById(id: string): Promise<boolean>;
}
