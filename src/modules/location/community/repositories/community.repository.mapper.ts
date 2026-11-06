import { Types } from 'mongoose';
import { isValidTranslationKey } from '@modules/translation/translation-identifiers';
import {
  isValidCommunityCountryIso,
  isValidCommunitySlug,
  isValidCommunityTimeZone,
} from '../community.validators';
import type { Community } from '../types/community.types';

export interface CommunityLeanDocument {
  _id: unknown;
  countryIso: unknown;
  slug: unknown;
  nameTranslationKey: unknown;
  timeZone: unknown;
  isActive: unknown;
}

export class CommunityRepositoryMapper {
  static toCommunity(doc: CommunityLeanDocument): Community {
    if (!(doc._id instanceof Types.ObjectId)) {
      throw new Error('Community _id must be an ObjectId');
    }
    if (
      typeof doc.countryIso !== 'string' ||
      !isValidCommunityCountryIso(doc.countryIso)
    ) {
      throw new Error(
        'Community countryIso must be an uppercase ISO 3166-1 alpha-2 code',
      );
    }
    if (typeof doc.slug !== 'string' || !isValidCommunitySlug(doc.slug)) {
      throw new Error('Community slug must be a lowercase route slug');
    }
    if (
      typeof doc.nameTranslationKey !== 'string' ||
      !isValidTranslationKey(doc.nameTranslationKey)
    ) {
      throw new Error('Community nameTranslationKey must be a valid key');
    }
    if (
      typeof doc.timeZone !== 'string' ||
      !isValidCommunityTimeZone(doc.timeZone)
    ) {
      throw new Error('Community timeZone must be a valid IANA time zone');
    }
    if (typeof doc.isActive !== 'boolean') {
      throw new Error('Community isActive must be a boolean');
    }

    return {
      id: doc._id.toHexString(),
      countryIso: doc.countryIso,
      slug: doc.slug,
      nameTranslationKey: doc.nameTranslationKey,
      timeZone: doc.timeZone,
      isActive: doc.isActive,
    };
  }

  static toCommunities(
    docs: readonly CommunityLeanDocument[],
  ): readonly Community[] {
    return docs.map((doc) => CommunityRepositoryMapper.toCommunity(doc));
  }
}
