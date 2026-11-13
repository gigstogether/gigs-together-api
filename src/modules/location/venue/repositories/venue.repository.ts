import type { Venue } from '../types/venue.types';

export const VENUE_REPOSITORY = Symbol('VENUE_REPOSITORY');

export interface CreateVenueRecordParams {
  localityId: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface FindVenuesParams {
  localityId?: string;
  search?: string;
  isActive?: boolean;
}

export interface UpdateVenueRecordParams {
  id: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface VenueRepository {
  create(params: CreateVenueRecordParams): Promise<Venue>;

  findById(id: string): Promise<Venue | null>;

  find(params: FindVenuesParams): Promise<readonly Venue[]>;

  existsByLocalityId(localityId: string): Promise<boolean>;

  update(params: UpdateVenueRecordParams): Promise<Venue | null>;

  deleteById(id: string): Promise<boolean>;
}
