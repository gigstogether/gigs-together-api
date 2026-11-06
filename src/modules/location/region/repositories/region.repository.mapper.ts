import { Types } from 'mongoose';
import type { Region } from '../types/region.types';
import { isValidRegionAliases, isValidRegionName } from '../region.validators';

export interface RegionLeanDocument {
  _id: unknown;
  countryIso: unknown;
  name: unknown;
  aliases: unknown;
}

export class RegionRepositoryMapper {
  static toRegion(doc: RegionLeanDocument): Region {
    if (!(doc._id instanceof Types.ObjectId)) {
      throw new Error('Region _id must be an ObjectId');
    }
    if (typeof doc.countryIso !== 'string' || doc.countryIso.length === 0) {
      throw new Error('Region countryIso must be a non-empty string');
    }
    if (typeof doc.name !== 'string' || !isValidRegionName(doc.name)) {
      throw new Error('Region name must be a non-empty canonical name');
    }
    if (
      !Array.isArray(doc.aliases) ||
      doc.aliases.some((alias) => typeof alias !== 'string') ||
      !isValidRegionAliases(doc.name, doc.aliases)
    ) {
      throw new Error('Region aliases must be unique non-empty names');
    }

    return {
      id: doc._id.toHexString(),
      countryIso: doc.countryIso,
      name: doc.name,
      aliases: [...doc.aliases],
    };
  }

  static toRegions(docs: readonly RegionLeanDocument[]): readonly Region[] {
    return docs.map((doc) => RegionRepositoryMapper.toRegion(doc));
  }
}
