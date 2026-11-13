import { Types } from 'mongoose';
import { isValidIanaTimeZone } from '@shared/utils/is-valid-iana-time-zone';
import { isValidTranslationKey } from '@modules/translation/translation-identifiers';
import { isValidCommunitySlug } from '../community.validators';
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
    if (typeof doc.countryIso !== 'string' || doc.countryIso.length === 0) {
      throw new Error('Community countryIso must be a non-empty string');
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
      !isValidIanaTimeZone(doc.timeZone)
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
