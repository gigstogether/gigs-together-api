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
import type { Locality } from '../locality/types/locality.types';
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
  isActive?: boolean;
}

export interface UpdateVenueParams {
  id: string;
  name?: string;
  aliases?: string[];
  isActive?: boolean;
}

export interface FindActiveVenueCatalogParams {
  localityId: string;
}

export interface ActiveVenueCatalog {
  locality: Locality;
  venues: readonly Venue[];
}

export interface GetActiveVenueSelectionParams {
  venueIds: readonly string[];
}

export interface GetAllVenueSelectionsParams {
  venueIdGroups: readonly (readonly string[])[];
}

export interface ResolvedVenueSelection {
  locality: Locality;
  venues: readonly Venue[];
}

class VenueSelectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = VenueSelectionValidationError.name;
  }
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
    if (params.isActive !== undefined) {
      repositoryParams.isActive = params.isActive;
    }

    const venues = await this.venueRepository.find(repositoryParams);
    await this.assertLocalitiesExist(venues);

    return venues;
  }

  async findActiveVenueCatalog(
    params: FindActiveVenueCatalogParams,
  ): Promise<ActiveVenueCatalog> {
    const locality = await this.localityService.getLocalityById(
      params.localityId,
    );
    const repositoryParams: FindVenuesParams = {
      localityId: params.localityId,
      isActive: true,
    };

    const venues = await this.venueRepository.find(repositoryParams);

    return { locality, venues };
  }

  async getActiveVenueSelection(
    params: GetActiveVenueSelectionParams,
  ): Promise<ResolvedVenueSelection> {
    try {
      const venueGroups = await this.getVenueGroups([params.venueIds]);
      this.assertVenueGroupsAreActive(venueGroups);
      const selections = await this.buildVenueSelections(venueGroups);
      const selection = selections[0];
      if (selection === undefined) {
        throw new Error('Resolved Venue selection must not be empty');
      }

      return selection;
    } catch (e) {
      if (e instanceof VenueSelectionValidationError) {
        throw new BadRequestException(e.message, { cause: e });
      }
      throw e;
    }
  }

  async getAllVenueSelections(
    params: GetAllVenueSelectionsParams,
  ): Promise<readonly ResolvedVenueSelection[]> {
    const venueGroups = await this.getVenueGroups(params.venueIdGroups);

    return this.buildVenueSelections(venueGroups);
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

  private async getVenueGroups(
    venueIdGroups: readonly (readonly string[])[],
  ): Promise<readonly (readonly Venue[])[]> {
    if (venueIdGroups.length === 0) {
      return [];
    }

    const normalizedVenueIdGroups = venueIdGroups.map((venueIds) => {
      if (venueIds.length === 0) {
        throw new VenueSelectionValidationError(
          'venueIds must contain at least one Venue id',
        );
      }

      const normalizedVenueIds = venueIds.map((venueId) =>
        venueId.toLowerCase(),
      );
      if (new Set(normalizedVenueIds).size !== normalizedVenueIds.length) {
        throw new VenueSelectionValidationError(
          'venueIds must not contain duplicates',
        );
      }

      return normalizedVenueIds;
    });
    const uniqueVenueIds = Array.from(new Set(normalizedVenueIdGroups.flat()));
    const foundVenues = await this.venueRepository.findByIds(uniqueVenueIds);
    const venuesById = new Map(
      foundVenues.map((venue) => [venue.id.toLowerCase(), venue]),
    );

    return normalizedVenueIdGroups.map((venueIds) =>
      venueIds.map((venueId) => {
        const venue = venuesById.get(venueId);
        if (!venue) {
          throw new VenueSelectionValidationError(
            'venueIds must reference existing Venues',
          );
        }

        return venue;
      }),
    );
  }

  private assertVenueGroupsAreActive(
    venueGroups: readonly (readonly Venue[])[],
  ): void {
    if (venueGroups.some((venues) => venues.some((venue) => !venue.isActive))) {
      throw new VenueSelectionValidationError(
        'venueIds must reference active Venues for new assignments',
      );
    }
  }

  private async buildVenueSelections(
    venueGroups: readonly (readonly Venue[])[],
  ): Promise<readonly ResolvedVenueSelection[]> {
    if (venueGroups.length === 0) {
      return [];
    }

    const localityIdsByGroup = venueGroups.map((venues) => {
      const localityIds = new Set(venues.map((venue) => venue.localityId));
      if (localityIds.size !== 1) {
        throw new VenueSelectionValidationError(
          'All assigned Venues must belong to the same Locality',
        );
      }

      const localityId = localityIds.values().next().value;
      if (localityId === undefined) {
        throw new Error('Resolved Venue selection must not be empty');
      }

      return localityId;
    });
    const uniqueLocalityIds = Array.from(new Set(localityIdsByGroup));
    const localities =
      await this.localityService.getLocalitiesByIds(uniqueLocalityIds);
    const localitiesById = new Map(
      localities.map((locality) => [locality.id, locality]),
    );

    return venueGroups.map((venues, index) => {
      const localityId = localityIdsByGroup[index];
      const locality =
        localityId === undefined ? undefined : localitiesById.get(localityId);
      if (!locality) {
        throw new Error('Resolved Venue Locality must exist');
      }

      return { locality, venues };
    });
  }

  private throwVenueWriteError(e: unknown): never {
    if (e instanceof VenueNameConflictError) {
      throw new ConflictException(e.message, { cause: e });
    }
    throw e;
  }
}
