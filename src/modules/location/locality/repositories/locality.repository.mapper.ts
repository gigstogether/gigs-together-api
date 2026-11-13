import { Types } from 'mongoose';
import type { Locality } from '../types/locality.types';
import {
  isValidLocalityAliases,
  isValidLocalityName,
  isValidLocalityQualifier,
  isValidLocalityTimeZone,
} from '../locality.validators';

export interface LocalityLeanDocument {
  _id: unknown;
  countryIso: unknown;
  name: unknown;
  qualifier?: unknown;
  aliases: unknown;
  timeZone: unknown;
}

export class LocalityRepositoryMapper {
  static toLocality(doc: LocalityLeanDocument): Locality {
    if (!(doc._id instanceof Types.ObjectId)) {
      throw new Error('Locality _id must be an ObjectId');
    }
    if (typeof doc.countryIso !== 'string' || doc.countryIso.length === 0) {
      throw new Error('Locality countryIso must be a non-empty string');
    }
    if (typeof doc.name !== 'string' || !isValidLocalityName(doc.name)) {
      throw new Error('Locality name must be a non-empty canonical name');
    }
    if (
      (doc.qualifier !== undefined && typeof doc.qualifier !== 'string') ||
      !isValidLocalityQualifier(doc.qualifier)
    ) {
      throw new Error(
        'Locality qualifier must be a non-empty canonical name when provided',
      );
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

    const locality: Locality = {
      id: doc._id.toHexString(),
      countryIso: doc.countryIso,
      name: doc.name,
      aliases: [...doc.aliases],
      timeZone: doc.timeZone,
    };

    if (typeof doc.qualifier === 'string') {
      locality.qualifier = doc.qualifier;
    }

    return locality;
  }

  static toLocalities(
    docs: readonly LocalityLeanDocument[],
  ): readonly Locality[] {
    return docs.map((doc) => LocalityRepositoryMapper.toLocality(doc));
  }
}
