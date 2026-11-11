import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RegionService } from '../region/region.service';
import { PLACE_REPOSITORY } from '../place/repositories/place.repository';
import type { PlaceRepository } from '../place/repositories/place.repository';
import { LocalityNameConflictError } from './locality.errors';
import { LOCALITY_REPOSITORY } from './repositories/locality.repository';
import type { LocalityRepository } from './repositories/locality.repository';
import type { Locality } from './types/locality.types';
import {
  isValidLocalityAliases,
  isValidLocalityName,
  isValidLocalityTimeZone,
  normalizeLocalityAliases,
  normalizeLocalityName,
  normalizeLocalityTimeZone,
} from './locality.validators';

export interface CreateLocalityParams {
  regionId: string;
  name: string;
  aliases: string[];
  timeZone: string;
}

export interface FindLocalitiesParams {
  regionId?: string;
  search?: string;
}

export interface UpdateLocalityParams {
  id: string;
  name?: string;
  aliases?: string[];
  timeZone?: string;
}

@Injectable()
export class LocalityService {
  constructor(
    @Inject(LOCALITY_REPOSITORY)
    private readonly localityRepository: LocalityRepository,
    private readonly regionService: RegionService,
    @Inject(PLACE_REPOSITORY)
    private readonly placeRepository: PlaceRepository,
  ) {}

  async createLocality(params: CreateLocalityParams): Promise<Locality> {
    const localityData = this.normalizeLocalityData(
      params.name,
      params.aliases,
      params.timeZone,
    );
    await this.requireRegion(params.regionId);

    try {
      return await this.localityRepository.create({
        regionId: params.regionId,
        ...localityData,
      });
    } catch (e) {
      this.throwLocalityWriteError(e);
    }
  }

  async getLocalityById(id: string): Promise<Locality> {
    const locality = await this.localityRepository.findById(id);

    if (!locality) {
      throw new NotFoundException(
        'Locality with id "' + id + '" does not exist',
      );
    }

    await this.assertRegionsExist([locality]);

    return locality;
  }

  async hasLocality(id: string): Promise<boolean> {
    const locality = await this.localityRepository.findById(id);

    if (!locality) {
      return false;
    }

    await this.assertRegionsExist([locality]);

    return true;
  }

  async findLocalities(
    params: FindLocalitiesParams,
  ): Promise<readonly Locality[]> {
    let regionId: string | undefined;
    let search: string | undefined;

    if (params.regionId !== undefined) {
      await this.requireRegion(params.regionId);
      regionId = params.regionId;
    }
    if (params.search !== undefined) {
      search = params.search.trim();
      if (search.length === 0) {
        throw new BadRequestException('Locality search must not be blank');
      }
    }

    const localities = await this.localityRepository.find({
      regionId,
      search,
    });
    await this.assertRegionsExist(localities);

    return localities;
  }

  async updateLocality(params: UpdateLocalityParams): Promise<Locality> {
    if (
      params.name === undefined &&
      params.aliases === undefined &&
      params.timeZone === undefined
    ) {
      throw new BadRequestException(
        'Locality update must include name, aliases, or timeZone',
      );
    }

    const existing = await this.getLocalityById(params.id);
    const name = params.name ?? existing.name;
    const aliases = params.aliases ?? existing.aliases;
    const timeZone = params.timeZone ?? existing.timeZone;
    const localityData = this.normalizeLocalityData(name, aliases, timeZone);

    try {
      const locality = await this.localityRepository.update({
        id: params.id,
        ...localityData,
      });

      if (!locality) {
        throw new NotFoundException(
          'Locality with id "' + params.id + '" does not exist',
        );
      }

      return locality;
    } catch (e) {
      this.throwLocalityWriteError(e);
    }
  }

  async deleteLocality(id: string): Promise<void> {
    const hasPlaces = await this.placeRepository.existsByLocalityId(id);

    if (hasPlaces) {
      throw new ConflictException(
        'Locality with id "' + id + '" is referenced by Places',
      );
    }

    const isDeleted = await this.localityRepository.deleteById(id);

    if (!isDeleted) {
      throw new NotFoundException(
        'Locality with id "' + id + '" does not exist',
      );
    }
  }

  private normalizeLocalityData(
    rawName: string,
    rawAliases: string[],
    rawTimeZone: string,
  ): Pick<Locality, 'name' | 'aliases' | 'timeZone'> {
    const name = normalizeLocalityName(rawName);
    const aliases = normalizeLocalityAliases(rawAliases);
    const timeZone = normalizeLocalityTimeZone(rawTimeZone);

    if (!isValidLocalityName(name)) {
      throw new BadRequestException(
        'Locality name must be a non-empty canonical name',
      );
    }
    if (!isValidLocalityAliases(name, aliases)) {
      throw new BadRequestException(
        'Locality aliases must be unique non-empty names distinct from the canonical name',
      );
    }
    if (!isValidLocalityTimeZone(timeZone)) {
      throw new BadRequestException(
        'Locality timeZone must be a valid IANA time zone',
      );
    }

    return { name, aliases, timeZone };
  }

  private async requireRegion(regionId: string): Promise<void> {
    const hasRegion = await this.regionService.hasRegion(regionId);

    if (!hasRegion) {
      throw new BadRequestException(
        'Region with id "' + regionId + '" does not exist',
      );
    }
  }

  private async assertRegionsExist(
    localities: readonly Locality[],
  ): Promise<void> {
    const regionIds = new Set(localities.map((locality) => locality.regionId));

    for (const regionId of regionIds) {
      const hasRegion = await this.regionService.hasRegion(regionId);
      if (!hasRegion) {
        throw new Error(
          'Locality regionId "' +
            regionId +
            '" must reference an existing Region',
        );
      }
    }
  }

  private throwLocalityWriteError(e: unknown): never {
    if (e instanceof LocalityNameConflictError) {
      throw new ConflictException(e.message, { cause: e });
    }
    throw e;
  }
}
