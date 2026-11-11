import { Types } from 'mongoose';
import type { Locality } from '../types/locality.types';
import {
  isValidLocalityAliases,
  isValidLocalityName,
  isValidLocalityTimeZone,
} from '../locality.validators';

export interface LocalityLeanDocument {
  _id: unknown;
  regionId: unknown;
  name: unknown;
  aliases: unknown;
  timeZone: unknown;
}

export class LocalityRepositoryMapper {
  static toStoredRegionId(regionId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(regionId)) {
      throw new Error('Region id must be a valid ObjectId');
    }

    return new Types.ObjectId(regionId);
  }

  static toLocality(doc: LocalityLeanDocument): Locality {
    if (!(doc._id instanceof Types.ObjectId)) {
      throw new Error('Locality _id must be an ObjectId');
    }
    if (!(doc.regionId instanceof Types.ObjectId)) {
      throw new Error('Locality regionId must be an ObjectId');
    }
    if (typeof doc.name !== 'string' || !isValidLocalityName(doc.name)) {
      throw new Error('Locality name must be a non-empty canonical name');
    }
    if (
      !Array.isArray(doc.aliases) ||
      doc.aliases.some((alias) => typeof alias !== 'string') ||
      !isValidLocalityAliases(doc.name, doc.aliases)
    ) {
      throw new Error('Locality aliases must be unique non-empty names');
    }
    if (
      typeof doc.timeZone !== 'string' ||
      !isValidLocalityTimeZone(doc.timeZone)
    ) {
      throw new Error('Locality timeZone must be a valid IANA time zone');
    }

    return {
      id: doc._id.toHexString(),
      regionId: doc.regionId.toHexString(),
      name: doc.name,
      aliases: [...doc.aliases],
      timeZone: doc.timeZone,
    };
  }

  static toLocalities(
    docs: readonly LocalityLeanDocument[],
  ): readonly Locality[] {
    return docs.map((doc) => LocalityRepositoryMapper.toLocality(doc));
  }
}
