import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  COMMUNITY_NAME_TRANSLATION_KEY_MAX_LENGTH,
  isValidCommunitySlug,
} from './community.validators';
import { isValidTranslationKey } from '@modules/translation/translation-identifiers';
import { TranslationService } from '@modules/translation/translation.service';
import { DEFAULT_LOCALE_ISO } from '@modules/locale/locale.constants';
import { isValidIanaTimeZone } from '@shared/utils/is-valid-iana-time-zone';
import { CommunityRouteConflictError } from './community.errors';
import { CountryService } from '@modules/location/country/country.service';
import { COMMUNITY_REPOSITORY } from './repositories/community.repository';
import type { CommunityRepository } from './repositories/community.repository';
import type { Community, CommunityData } from './types/community.types';

export interface FindCommunityByRouteParams {
  countryIso: string;
  communitySlug: string;
}

export interface UpdateCommunityParams {
  id: string;
  countryIso?: string;
  slug?: string;
  nameTranslationKey?: string;
  timeZone?: string;
  isActive?: boolean;
}

@Injectable()
export class CommunityService {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    private readonly countryService: CountryService,
    private readonly translationService: TranslationService,
  ) {}

  async findAll(): Promise<Community[]> {
    const communities = await this.communityRepository.findAll();
    this.assertCountriesExist(communities);
    return communities;
  }

  async getById(id: string): Promise<Community> {
    const community = await this.findById(id);
    if (community === null) {
      throw new NotFoundException('Community does not exist');
    }
    return community;
  }

  async createCommunity(data: CommunityData): Promise<Community> {
    const normalized = this.normalizeCommunityData(data);
    if (normalized.isActive) {
      await this.requireCommunityName(normalized.nameTranslationKey);
    }
    try {
      return await this.communityRepository.create(normalized);
    } catch (e) {
      this.throwWriteError(e);
    }
  }

  async updateCommunity(params: UpdateCommunityParams): Promise<Community> {
    if (
      params.countryIso === undefined &&
      params.slug === undefined &&
      params.nameTranslationKey === undefined &&
      params.timeZone === undefined &&
      params.isActive === undefined
    ) {
      throw new BadRequestException(
        'Community update must include at least one field',
      );
    }
    // Keep validation and conditional persistence based on the same stored snapshot.
    const existing = await this.getById(params.id);
    const data = this.normalizeCommunityData({
      countryIso: params.countryIso ?? existing.countryIso,
      slug: params.slug ?? existing.slug,
      nameTranslationKey:
        params.nameTranslationKey ?? existing.nameTranslationKey,
      timeZone: params.timeZone ?? existing.timeZone,
      isActive: params.isActive ?? existing.isActive,
    });
    if (data.isActive) {
      await this.requireCommunityName(data.nameTranslationKey);
    }
    try {
      const community = await this.communityRepository.update({
        id: params.id,
        data,
        expected: existing,
      });
      if (community === null) {
        if ((await this.findById(params.id)) === null) {
          throw new NotFoundException('Community does not exist');
        }
        throw new ConflictException(
          'Community changed while saving. Reload it and try again.',
        );
      }
      return community;
    } catch (e) {
      this.throwWriteError(e);
    }
  }

  private async requireCommunityName(key: string): Promise<void> {
    const record = await this.translationService.findRecord({
      namespace: 'community',
      locale: DEFAULT_LOCALE_ISO,
      key,
    });
    if (
      record === null ||
      !record.isActive ||
      record.kind !== 'text' ||
      record.format !== 'plain' ||
      record.value.trim().length === 0
    ) {
      throw new BadRequestException(
        `Active Communities require an active plain-text name for locale "${DEFAULT_LOCALE_ISO}" in the community translation namespace`,
      );
    }
  }

  private normalizeCommunityData(data: CommunityData): CommunityData {
    const normalized: CommunityData = {
      countryIso: data.countryIso.trim().toUpperCase(),
      slug: data.slug.trim().toLowerCase(),
      nameTranslationKey: data.nameTranslationKey.trim(),
      timeZone: data.timeZone.trim(),
      isActive: data.isActive,
    };
    if (!this.countryService.hasCountry(normalized.countryIso)) {
      throw new BadRequestException(
        'Community countryIso must be a supported ISO 3166-1 alpha-2 code',
      );
    }
    if (!isValidCommunitySlug(normalized.slug)) {
      throw new BadRequestException(
        'Community slug must be a lowercase route slug of at most 120 characters',
      );
    }
    if (
      !isValidTranslationKey(normalized.nameTranslationKey) ||
      normalized.nameTranslationKey.length >
        COMMUNITY_NAME_TRANSLATION_KEY_MAX_LENGTH
    ) {
      throw new BadRequestException(
        'Community nameTranslationKey must be a valid translation key',
      );
    }
    if (!isValidIanaTimeZone(normalized.timeZone)) {
      throw new BadRequestException(
        'Community timeZone must be a valid IANA time zone',
      );
    }
    return normalized;
  }

  private throwWriteError(e: unknown): never {
    if (e instanceof CommunityRouteConflictError) {
      throw new ConflictException(e.message, { cause: e });
    }
    throw e;
  }

  async findById(id: string): Promise<Community | null> {
    const community = await this.communityRepository.findById(id);

    if (community !== null) {
      this.assertCountriesExist([community]);
    }

    return community;
  }

  async findByIds(ids: string[]): Promise<readonly Community[]> {
    const communities = await this.communityRepository.findByIds(ids);
    this.assertCountriesExist(communities);

    return communities;
  }

  async findByRoute(
    params: FindCommunityByRouteParams,
  ): Promise<Community | null> {
    if (!isValidCommunitySlug(params.communitySlug)) {
      throw new Error('Community slug must be a lowercase route slug');
    }

    const hasCountry = this.countryService.hasCountry(params.countryIso);
    if (!hasCountry) {
      return null;
    }

    return this.communityRepository.findByRoute(params);
  }

  async findActive(): Promise<readonly Community[]> {
    const communities = await this.communityRepository.findActive();
    this.assertCountriesExist(communities);

    return communities;
  }

  async requireActiveCommunityIds(communityIds: string[]): Promise<string[]> {
    if (communityIds.length === 0) {
      throw new BadRequestException(
        'communityIds must contain at least one Community id',
      );
    }

    const normalizedCommunityIds = communityIds.map((communityId) => {
      if (!/^[a-f\d]{24}$/i.test(communityId)) {
        throw new BadRequestException(
          'communityIds must contain valid Community ids',
        );
      }
      return communityId.toLowerCase();
    });
    if (
      new Set(normalizedCommunityIds).size !== normalizedCommunityIds.length
    ) {
      throw new BadRequestException('communityIds must not contain duplicates');
    }

    const communities = await this.findByIds(normalizedCommunityIds);
    const activeCommunityIds = new Set(
      communities
        .filter((community) => community.isActive)
        .map((community) => community.id),
    );
    if (
      normalizedCommunityIds.some(
        (communityId) => !activeCommunityIds.has(communityId),
      )
    ) {
      throw new BadRequestException(
        'communityIds must reference active Communities',
      );
    }

    return normalizedCommunityIds;
  }

  private assertCountriesExist(communities: readonly Community[]): void {
    const countryIsos = new Set(
      communities.map((community) => community.countryIso),
    );

    for (const countryIso of countryIsos) {
      const hasCountry = this.countryService.hasCountry(countryIso);
      if (!hasCountry) {
        throw new Error(
          'Community countryIso "' +
            countryIso +
            '" must be a supported ISO 3166-1 alpha-2 code',
        );
      }
    }
  }
}
