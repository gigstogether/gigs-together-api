import { Types } from 'mongoose';
import type { Venue } from '../types/venue.types';
import { isValidVenueAliases, isValidVenueName } from '../venue.validators';

export interface VenueLeanDocument {
  _id: unknown;
  localityId: unknown;
  name: unknown;
  aliases: unknown;
  isActive: unknown;
}

export class VenueRepositoryMapper {
  static toStoredLocalityId(localityId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(localityId)) {
      throw new Error('Locality id must be a valid ObjectId');
    }

    return new Types.ObjectId(localityId);
  }

  static toVenue(doc: VenueLeanDocument): Venue {
    if (!(doc._id instanceof Types.ObjectId)) {
      throw new Error('Venue _id must be an ObjectId');
    }
    if (!(doc.localityId instanceof Types.ObjectId)) {
      throw new Error('Venue localityId must be an ObjectId');
    }
    if (typeof doc.name !== 'string' || !isValidVenueName(doc.name)) {
      throw new Error('Venue name must be a non-empty canonical name');
    }
    if (
      !Array.isArray(doc.aliases) ||
      doc.aliases.some((alias) => typeof alias !== 'string') ||
      !isValidVenueAliases(doc.name, doc.aliases)
    ) {
      throw new Error('Venue aliases must be unique non-empty names');
    }
    if (typeof doc.isActive !== 'boolean') {
      throw new Error('Venue isActive must be a boolean');
    }

    return {
      id: doc._id.toHexString(),
      localityId: doc.localityId.toHexString(),
      name: doc.name,
      aliases: [...doc.aliases],
      isActive: doc.isActive,
    };
  }

  static toVenues(docs: readonly VenueLeanDocument[]): readonly Venue[] {
    return docs.map((doc) => VenueRepositoryMapper.toVenue(doc));
  }
}
