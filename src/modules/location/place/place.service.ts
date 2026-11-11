import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocalityService } from '../locality/locality.service';
import { PlaceNameConflictError } from './place.errors';
import { PLACE_REPOSITORY } from './repositories/place.repository';
import type { PlaceRepository } from './repositories/place.repository';
import type { Place } from './types/place.types';
import {
  isValidPlaceAliases,
  isValidPlaceName,
  normalizePlaceAliases,
  normalizePlaceName,
} from './place.validators';

export interface CreatePlaceParams {
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

export interface UpdatePlaceParams {
  id: string;
  name?: string;
  aliases?: string[];
  isActive?: boolean;
}

@Injectable()
export class PlaceService {
  constructor(
    @Inject(PLACE_REPOSITORY)
    private readonly placeRepository: PlaceRepository,
    private readonly localityService: LocalityService,
  ) {}

  async createPlace(params: CreatePlaceParams): Promise<Place> {
    const placeData = this.normalizePlaceData(params.name, params.aliases);
    await this.requireLocality(params.localityId);

    try {
      return await this.placeRepository.create({
        localityId: params.localityId,
        ...placeData,
        isActive: params.isActive,
      });
    } catch (e) {
      this.throwPlaceWriteError(e);
    }
  }

  async getPlaceById(id: string): Promise<Place> {
    const place = await this.placeRepository.findById(id);

    if (!place) {
      throw new NotFoundException('Place with id "' + id + '" does not exist');
    }

    await this.assertLocalitiesExist([place]);

    return place;
  }

  async findPlaces(params: FindPlacesParams): Promise<readonly Place[]> {
    const repositoryParams: FindPlacesParams = {};

    if (params.localityId !== undefined) {
      await this.requireLocality(params.localityId);
      repositoryParams.localityId = params.localityId;
    }
    if (params.search !== undefined) {
      const search = params.search.trim();
      if (search.length === 0) {
        throw new BadRequestException('Place search must not be blank');
      }
      repositoryParams.search = search;
    }
    if (params.isActive !== undefined) {
      repositoryParams.isActive = params.isActive;
    }

    const places = await this.placeRepository.find(repositoryParams);
    await this.assertLocalitiesExist(places);

    return places;
  }

  async updatePlace(params: UpdatePlaceParams): Promise<Place> {
    if (
      params.name === undefined &&
      params.aliases === undefined &&
      params.isActive === undefined
    ) {
      throw new BadRequestException(
        'Place update must include name, aliases, or isActive',
      );
    }

    const existing = await this.getPlaceById(params.id);
    const name = params.name ?? existing.name;
    const aliases = params.aliases ?? existing.aliases;
    const isActive = params.isActive ?? existing.isActive;
    const placeData = this.normalizePlaceData(name, aliases);

    try {
      const place = await this.placeRepository.update({
        id: params.id,
        ...placeData,
        isActive,
      });

      if (!place) {
        throw new NotFoundException(
          'Place with id "' + params.id + '" does not exist',
        );
      }

      return place;
    } catch (e) {
      this.throwPlaceWriteError(e);
    }
  }

  async deletePlace(id: string): Promise<void> {
    const isDeleted = await this.placeRepository.deleteById(id);

    if (!isDeleted) {
      throw new NotFoundException('Place with id "' + id + '" does not exist');
    }
  }

  private normalizePlaceData(
    rawName: string,
    rawAliases: string[],
  ): Pick<Place, 'name' | 'aliases'> {
    const name = normalizePlaceName(rawName);
    const aliases = normalizePlaceAliases(rawAliases);

    if (!isValidPlaceName(name)) {
      throw new BadRequestException(
        'Place name must be a non-empty canonical name',
      );
    }
    if (!isValidPlaceAliases(name, aliases)) {
      throw new BadRequestException(
        'Place aliases must be unique non-empty names distinct from the canonical name',
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

  private async assertLocalitiesExist(places: readonly Place[]): Promise<void> {
    const localityIds = new Set(places.map((place) => place.localityId));

    for (const localityId of localityIds) {
      const hasLocality = await this.localityService.hasLocality(localityId);
      if (!hasLocality) {
        throw new Error(
          'Place localityId "' +
            localityId +
            '" must reference an existing Locality',
        );
      }
    }
  }

  private throwPlaceWriteError(e: unknown): never {
    if (e instanceof PlaceNameConflictError) {
      throw new ConflictException(e.message, { cause: e });
    }
    throw e;
  }
}
