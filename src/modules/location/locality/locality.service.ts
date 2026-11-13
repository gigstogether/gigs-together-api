import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CountryService } from '../country/country.service';
import { PLACE_REPOSITORY } from '../place/repositories/place.repository';
import type { PlaceRepository } from '../place/repositories/place.repository';
import { LocalityNameConflictError } from './locality.errors';
import { LOCALITY_REPOSITORY } from './repositories/locality.repository';
import type { LocalityRepository } from './repositories/locality.repository';
import type { Locality } from './types/locality.types';
import {
  isValidLocalityAliases,
  isValidLocalityName,
  isValidLocalityQualifier,
  isValidLocalityTimeZone,
  normalizeLocalityAliases,
  normalizeLocalityName,
  normalizeLocalityQualifier,
  normalizeLocalityTimeZone,
} from './locality.validators';

export interface CreateLocalityParams {
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

export interface UpdateLocalityParams {
  id: string;
  name?: string;
  qualifier?: string | null;
  aliases?: string[];
  timeZone?: string;
}

@Injectable()
export class LocalityService {
  constructor(
    @Inject(LOCALITY_REPOSITORY)
    private readonly localityRepository: LocalityRepository,
    private readonly countryService: CountryService,
    @Inject(PLACE_REPOSITORY)
    private readonly placeRepository: PlaceRepository,
  ) {}

  async createLocality(params: CreateLocalityParams): Promise<Locality> {
    const localityData = this.normalizeLocalityData(
      params.name,
      params.qualifier,
      params.aliases,
      params.timeZone,
    );
    this.requireCountry(params.countryIso);

    try {
      return await this.localityRepository.create({
        countryIso: params.countryIso,
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

    this.assertCountriesExist([locality]);

    return locality;
  }

  async hasLocality(id: string): Promise<boolean> {
    const locality = await this.localityRepository.findById(id);

    if (!locality) {
      return false;
    }

    this.assertCountriesExist([locality]);

    return true;
  }

  async findLocalities(
    params: FindLocalitiesParams,
  ): Promise<readonly Locality[]> {
    let countryIso: string | undefined;
    let search: string | undefined;

    if (params.countryIso !== undefined) {
      this.requireCountry(params.countryIso);
      countryIso = params.countryIso;
    }
    if (params.search !== undefined) {
      search = params.search.trim();
      if (search.length === 0) {
        throw new BadRequestException('Locality search must not be blank');
      }
    }

    const localities = await this.localityRepository.find({
      countryIso,
      search,
    });
    this.assertCountriesExist(localities);

    return localities;
  }

  async updateLocality(params: UpdateLocalityParams): Promise<Locality> {
    if (
      params.name === undefined &&
      params.qualifier === undefined &&
      params.aliases === undefined &&
      params.timeZone === undefined
    ) {
      throw new BadRequestException(
        'Locality update must include name, qualifier, aliases, or timeZone',
      );
    }

    const existing = await this.getLocalityById(params.id);
    const name = params.name ?? existing.name;
    const qualifier =
      params.qualifier === undefined
        ? existing.qualifier
        : (params.qualifier ?? undefined);
    const aliases = params.aliases ?? existing.aliases;
    const timeZone = params.timeZone ?? existing.timeZone;
    const localityData = this.normalizeLocalityData(
      name,
      qualifier,
      aliases,
      timeZone,
    );

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
    rawQualifier: string | undefined,
    rawAliases: string[],
    rawTimeZone: string,
  ): Pick<Locality, 'name' | 'qualifier' | 'aliases' | 'timeZone'> {
    const name = normalizeLocalityName(rawName);
    const qualifier = normalizeLocalityQualifier(rawQualifier);
    const aliases = normalizeLocalityAliases(rawAliases);
    const timeZone = normalizeLocalityTimeZone(rawTimeZone);

    if (!isValidLocalityName(name)) {
      throw new BadRequestException(
        'Locality name must be a non-empty canonical name',
      );
    }
    if (!isValidLocalityQualifier(qualifier)) {
      throw new BadRequestException(
        'Locality qualifier must be a non-empty canonical name when provided',
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

    const localityData: Pick<
      Locality,
      'name' | 'qualifier' | 'aliases' | 'timeZone'
    > = {
      name,
      aliases,
      timeZone,
    };

    if (qualifier !== undefined) {
      localityData.qualifier = qualifier;
    }

    return localityData;
  }

  private requireCountry(countryIso: string): void {
    const hasCountry = this.countryService.hasCountry(countryIso);

    if (!hasCountry) {
      throw new BadRequestException(
        'Country ISO code "' + countryIso + '" is not supported',
      );
    }
  }

  private assertCountriesExist(localities: readonly Locality[]): void {
    const countryIsos = new Set(
      localities.map((locality) => locality.countryIso),
    );

    for (const countryIso of countryIsos) {
      const hasCountry = this.countryService.hasCountry(countryIso);
      if (!hasCountry) {
        throw new Error(
          'Locality countryIso "' +
            countryIso +
            '" must be a supported ISO 3166-1 alpha-2 code',
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
