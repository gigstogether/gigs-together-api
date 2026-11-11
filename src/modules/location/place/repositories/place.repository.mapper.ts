import { Types } from 'mongoose';
import type { Place } from '../types/place.types';
import { isValidPlaceAliases, isValidPlaceName } from '../place.validators';

export interface PlaceLeanDocument {
  _id: unknown;
  localityId: unknown;
  name: unknown;
  aliases: unknown;
  isActive: unknown;
}

export class PlaceRepositoryMapper {
  static toStoredLocalityId(localityId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(localityId)) {
      throw new Error('Locality id must be a valid ObjectId');
    }

    return new Types.ObjectId(localityId);
  }

  static toPlace(doc: PlaceLeanDocument): Place {
    if (!(doc._id instanceof Types.ObjectId)) {
      throw new Error('Place _id must be an ObjectId');
    }
    if (!(doc.localityId instanceof Types.ObjectId)) {
      throw new Error('Place localityId must be an ObjectId');
    }
    if (typeof doc.name !== 'string' || !isValidPlaceName(doc.name)) {
      throw new Error('Place name must be a non-empty canonical name');
    }
    if (
      !Array.isArray(doc.aliases) ||
      doc.aliases.some((alias) => typeof alias !== 'string') ||
      !isValidPlaceAliases(doc.name, doc.aliases)
    ) {
      throw new Error('Place aliases must be unique non-empty names');
    }
    if (typeof doc.isActive !== 'boolean') {
      throw new Error('Place isActive must be a boolean');
    }

    return {
      id: doc._id.toHexString(),
      localityId: doc.localityId.toHexString(),
      name: doc.name,
      aliases: [...doc.aliases],
      isActive: doc.isActive,
    };
  }

  static toPlaces(docs: readonly PlaceLeanDocument[]): readonly Place[] {
    return docs.map((doc) => PlaceRepositoryMapper.toPlace(doc));
  }
}
