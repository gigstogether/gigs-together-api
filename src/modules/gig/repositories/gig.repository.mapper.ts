import { Types } from 'mongoose';
import type {
  GigPoster,
  GigPost,
  GigSource,
  GigSourceMessengerUser,
  PlainGig,
} from '../types/gig.types';
import { Messenger } from '../../../shared/types/messenger.enum';
import { isRecord } from '../../../shared/utils/is-record';
import { GigSourceType } from '../types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../types/gig-source-user-origin-type.enum';
import type { GigStoredSource } from '../gig.schema';
import { isGigSourceMessengerUser } from '../gig-source.guards';

interface StringableId {
  toString(): string;
}

export interface GigLeanDocument {
  _id: string | StringableId;
  publicId: string;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: GigPoster;
  isVisible: boolean;
  version: number;
  source: unknown;
  posts: GigPost[];
  createdAt: Date;
  updatedAt: Date;
}

function stringifyId(value: unknown, field: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (isRecord(value) && typeof value.toString === 'function') {
    const id = value.toString();
    if (id.length > 0 && id !== '[object Object]') {
      return id;
    }
  }
  throw new Error(`Gig ${field} is missing or invalid.`);
}

export class GigRepositoryMapper {
  static toStoredSource(source: GigSource): GigStoredSource {
    switch (source.type) {
      case GigSourceType.User: {
        if (isGigSourceMessengerUser(source)) {
          const storedSource: GigStoredSource = {
            type: GigSourceType.User,
            origin: { ...source.origin },
          };
          if (source.userId !== undefined) {
            storedSource.userId = this.toObjectId(source.userId);
          }
          return storedSource;
        }
        return {
          type: GigSourceType.User,
          userId: this.toObjectId(source.userId),
          origin: { ...source.origin },
        };
      }
      case GigSourceType.Provider:
        return {
          type: GigSourceType.Provider,
          provider: { ...source.provider },
        };
      default:
        throw new Error('Unsupported Gig source type.');
    }
  }

  static fromStoredSource(source: unknown): GigSource {
    if (!isRecord(source) || typeof source.type !== 'string') {
      throw new Error('Gig source is missing or invalid.');
    }

    if (source.type === GigSourceType.User) {
      if (!isRecord(source.origin)) {
        throw new Error('Gig user source origin is missing or invalid.');
      }
      const originType = source.origin.type;
      if (originType === GigSourceUserOriginType.Messenger) {
        if (
          (source.userId !== undefined &&
            !(source.userId instanceof Types.ObjectId)) ||
          source.origin.messenger !== Messenger.Telegram
        ) {
          throw new Error('Gig user source messenger origin is invalid.');
        }
        const messengerSource: GigSourceMessengerUser = {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
          },
        };
        if (source.userId instanceof Types.ObjectId) {
          messengerSource.userId = source.userId.toString();
        }
        return messengerSource;
      }
      if (
        originType !== GigSourceUserOriginType.Form &&
        originType !== GigSourceUserOriginType.Admin
      ) {
        throw new Error('Gig user source origin is invalid.');
      }
      if (!(source.userId instanceof Types.ObjectId)) {
        throw new Error('Gig user source userId is invalid.');
      }
      return {
        type: GigSourceType.User,
        userId: source.userId.toString(),
        origin: { type: originType },
      };
    }

    if (source.type === GigSourceType.Provider) {
      const provider = source.provider;
      if (
        !isRecord(provider) ||
        typeof provider.name !== 'string' ||
        provider.name.length === 0 ||
        typeof provider.externalEventId !== 'string' ||
        typeof provider.sourceUrl !== 'string' ||
        !(provider.fetchedAt instanceof Date) ||
        (provider.externalVersionId !== undefined &&
          typeof provider.externalVersionId !== 'string') ||
        (provider.providerUpdatedAt !== undefined &&
          !(provider.providerUpdatedAt instanceof Date))
      ) {
        throw new Error('Gig provider source is invalid.');
      }
      return {
        type: GigSourceType.Provider,
        provider: {
          name: provider.name,
          externalEventId: provider.externalEventId,
          sourceUrl: provider.sourceUrl,
          fetchedAt: new Date(provider.fetchedAt),
          ...(provider.externalVersionId !== undefined
            ? { externalVersionId: provider.externalVersionId }
            : {}),
          ...(provider.providerUpdatedAt !== undefined
            ? { providerUpdatedAt: new Date(provider.providerUpdatedAt) }
            : {}),
        },
      };
    }

    throw new Error(`Unsupported Gig source type: ${source.type}`);
  }

  static toGig(doc: GigLeanDocument): PlainGig {
    return {
      id: stringifyId(doc._id, '_id'),
      publicId: doc.publicId,
      title: doc.title,
      date: doc.date,
      ...(doc.endDate !== undefined ? { endDate: doc.endDate } : {}),
      city: doc.city,
      country: doc.country,
      venue: doc.venue,
      ticketsUrl: doc.ticketsUrl,
      ...(doc.poster !== undefined ? { poster: { ...doc.poster } } : {}),
      isVisible: doc.isVisible,
      version: doc.version,
      source: this.fromStoredSource(doc.source),
      posts: doc.posts.map((post) => ({ ...post })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  static toGigs(docs: GigLeanDocument[]): PlainGig[] {
    return docs.map((doc) => GigRepositoryMapper.toGig(doc));
  }

  private static toObjectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid Gig source user id: ${value}`);
    }
    return new Types.ObjectId(value);
  }
}
