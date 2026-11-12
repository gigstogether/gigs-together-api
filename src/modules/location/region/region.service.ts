import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CountryService } from '../country/country.service';
import { RegionNameConflictError } from './region.errors';
import { REGION_REPOSITORY } from './repositories/region.repository';
import type { RegionRepository } from './repositories/region.repository';
import type { Region } from './types/region.types';
import {
  isValidRegionAliases,
  isValidRegionName,
  normalizeRegionAliases,
  normalizeRegionName,
} from './region.validators';

export interface CreateRegionParams {
  countryIso: string;
  name: string;
  aliases: string[];
}

export interface FindRegionsParams {
  countryIso?: string;
  search?: string;
}

export interface UpdateRegionParams {
  id: string;
  name?: string;
  aliases?: string[];
}

@Injectable()
export class RegionService {
  constructor(
    @Inject(REGION_REPOSITORY)
    private readonly regionRepository: RegionRepository,
    private readonly countryService: CountryService,
  ) {}

  async createRegion(params: CreateRegionParams): Promise<Region> {
    const regionData = this.normalizeRegionData(params.name, params.aliases);
    await this.requireCountry(params.countryIso);

    try {
      return await this.regionRepository.create({
        countryIso: params.countryIso,
        ...regionData,
      });
    } catch (e) {
      this.throwRegionWriteError(e);
    }
  }

  async getRegionById(id: string): Promise<Region> {
    const region = await this.regionRepository.findById(id);

    if (!region) {
      throw new NotFoundException('Region with id "' + id + '" does not exist');
    }

    await this.assertCountriesExist([region]);

    return region;
  }

  async hasRegion(id: string): Promise<boolean> {
    const region = await this.regionRepository.findById(id);

    if (!region) {
      return false;
    }

    await this.assertCountriesExist([region]);

    return true;
  }

  async findRegions(params: FindRegionsParams): Promise<readonly Region[]> {
    let countryIso: string | undefined;
    let search: string | undefined;

    if (params.countryIso !== undefined) {
      await this.requireCountry(params.countryIso);
      countryIso = params.countryIso;
    }
    if (params.search !== undefined) {
      search = params.search.trim();
      if (search.length === 0) {
        throw new BadRequestException('Region search must not be blank');
      }
    }

    const regions = await this.regionRepository.find({ countryIso, search });
    await this.assertCountriesExist(regions);

    return regions;
  }

  async updateRegion(params: UpdateRegionParams): Promise<Region> {
    if (params.name === undefined && params.aliases === undefined) {
      throw new BadRequestException(
        'Region update must include name or aliases',
      );
    }

    const existing = await this.getRegionById(params.id);
    const name = params.name ?? existing.name;
    const aliases = params.aliases ?? existing.aliases;
    const regionData = this.normalizeRegionData(name, aliases);

    try {
      const region = await this.regionRepository.update({
        id: params.id,
        ...regionData,
      });

      if (!region) {
        throw new NotFoundException(
          'Region with id "' + params.id + '" does not exist',
        );
      }

      return region;
    } catch (e) {
      this.throwRegionWriteError(e);
    }
  }

  async deleteRegion(id: string): Promise<void> {
    const isDeleted = await this.regionRepository.deleteById(id);

    if (!isDeleted) {
      throw new NotFoundException('Region with id "' + id + '" does not exist');
    }
  }

  private normalizeRegionData(
    rawName: string,
    rawAliases: string[],
  ): Pick<Region, 'name' | 'aliases'> {
    const name = normalizeRegionName(rawName);
    const aliases = normalizeRegionAliases(rawAliases);

    if (!isValidRegionName(name)) {
      throw new BadRequestException(
        'Region name must be a non-empty canonical name',
      );
    }
    if (!isValidRegionAliases(name, aliases)) {
      throw new BadRequestException(
        'Region aliases must be unique non-empty names distinct from the canonical name',
      );
    }

    return { name, aliases };
  }

  private async requireCountry(countryIso: string): Promise<void> {
    const hasCountry = await this.countryService.hasCountry(countryIso);

    if (!hasCountry) {
      throw new BadRequestException(
        'Country with ISO code "' + countryIso + '" does not exist',
      );
    }
  }

  private async assertCountriesExist(
    regions: readonly Region[],
  ): Promise<void> {
    const countryIsos = new Set(regions.map((region) => region.countryIso));

    for (const countryIso of countryIsos) {
      const hasCountry = await this.countryService.hasCountry(countryIso);
      if (!hasCountry) {
        throw new Error(
          'Region countryIso "' +
            countryIso +
            '" must reference an existing Country',
        );
      }
    }
  }

  private throwRegionWriteError(e: unknown): never {
    if (e instanceof RegionNameConflictError) {
      throw new ConflictException(e.message, { cause: e });
    }
    throw e;
  }
}
