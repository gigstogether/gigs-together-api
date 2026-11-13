import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocalityService } from '../locality/locality.service';
import { VenueNameConflictError } from './venue.errors';
import { VENUE_REPOSITORY } from './repositories/venue.repository';
import type { VenueRepository } from './repositories/venue.repository';
import type { Venue } from './types/venue.types';
import {
  isValidVenueAliases,
  isValidVenueName,
  normalizeVenueAliases,
  normalizeVenueName,
} from './venue.validators';

export interface CreateVenueParams {
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

export interface UpdateVenueParams {
  id: string;
  name?: string;
  aliases?: string[];
  isActive?: boolean;
}

@Injectable()
export class VenueService {
  constructor(
    @Inject(VENUE_REPOSITORY)
    private readonly venueRepository: VenueRepository,
    private readonly localityService: LocalityService,
  ) {}

  async createVenue(params: CreateVenueParams): Promise<Venue> {
    const venueData = this.normalizeVenueData(params.name, params.aliases);
    await this.requireLocality(params.localityId);

    try {
      return await this.venueRepository.create({
        localityId: params.localityId,
        ...venueData,
        isActive: params.isActive,
      });
    } catch (e) {
      this.throwVenueWriteError(e);
    }
  }

  async getVenueById(id: string): Promise<Venue> {
    const venue = await this.venueRepository.findById(id);

    if (!venue) {
      throw new NotFoundException('Venue with id "' + id + '" does not exist');
    }

    await this.assertLocalitiesExist([venue]);

    return venue;
  }

  async findVenues(params: FindVenuesParams): Promise<readonly Venue[]> {
    const repositoryParams: FindVenuesParams = {};

    if (params.localityId !== undefined) {
      await this.requireLocality(params.localityId);
      repositoryParams.localityId = params.localityId;
    }
    if (params.search !== undefined) {
      const search = params.search.trim();
      if (search.length === 0) {
        throw new BadRequestException('Venue search must not be blank');
      }
      repositoryParams.search = search;
    }
    if (params.isActive !== undefined) {
      repositoryParams.isActive = params.isActive;
    }

    const venues = await this.venueRepository.find(repositoryParams);
    await this.assertLocalitiesExist(venues);

    return venues;
  }

  async updateVenue(params: UpdateVenueParams): Promise<Venue> {
    if (
      params.name === undefined &&
      params.aliases === undefined &&
      params.isActive === undefined
    ) {
      throw new BadRequestException(
        'Venue update must include name, aliases, or isActive',
      );
    }

    const existing = await this.getVenueById(params.id);
    const name = params.name ?? existing.name;
    const aliases = params.aliases ?? existing.aliases;
    const isActive = params.isActive ?? existing.isActive;
    const venueData = this.normalizeVenueData(name, aliases);

    try {
      const venue = await this.venueRepository.update({
        id: params.id,
        ...venueData,
        isActive,
      });

      if (!venue) {
        throw new NotFoundException(
          'Venue with id "' + params.id + '" does not exist',
        );
      }

      return venue;
    } catch (e) {
      this.throwVenueWriteError(e);
    }
  }

  async deleteVenue(id: string): Promise<void> {
    const isDeleted = await this.venueRepository.deleteById(id);

    if (!isDeleted) {
      throw new NotFoundException('Venue with id "' + id + '" does not exist');
    }
  }

  private normalizeVenueData(
    rawName: string,
    rawAliases: string[],
  ): Pick<Venue, 'name' | 'aliases'> {
    const name = normalizeVenueName(rawName);
    const aliases = normalizeVenueAliases(rawAliases);

    if (!isValidVenueName(name)) {
      throw new BadRequestException(
        'Venue name must be a non-empty canonical name',
      );
    }
    if (!isValidVenueAliases(name, aliases)) {
      throw new BadRequestException(
        'Venue aliases must be unique non-empty names distinct from the canonical name',
      );
    }

    return { name, aliases };
  }

  private async requireLocality(localityId: string): Promise<void> {
    const hasLocality = await this.localityService.hasLocality(localityId);

    if (!hasLocality) {
      throw new BadRequestException(
        'Locality with id "' + localityId + '" does not exist',
      );
    }
  }

  private async assertLocalitiesExist(venues: readonly Venue[]): Promise<void> {
    const localityIds = new Set(venues.map((venue) => venue.localityId));

    for (const localityId of localityIds) {
      const hasLocality = await this.localityService.hasLocality(localityId);
      if (!hasLocality) {
        throw new Error(
          'Venue localityId "' +
            localityId +
            '" must reference an existing Locality',
        );
      }
    }
  }

  private throwVenueWriteError(e: unknown): never {
    if (e instanceof VenueNameConflictError) {
      throw new ConflictException(e.message, { cause: e });
    }
    throw e;
  }
}
