import type {
  GigPoster,
  GigPost,
  GigSource,
  PlainGig,
} from '../types/gig.types';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function mapGigSource(source: unknown): GigSource {
  if (!isRecord(source) || typeof source.type !== 'string') {
    throw new Error('Gig source is missing or invalid.');
  }

  if (source.type === 'user') {
    if (!isRecord(source.origin)) {
      throw new Error('Gig user source origin is missing or invalid.');
    }
    const originType = source.origin.type;
    if (
      originType !== 'form' &&
      originType !== 'admin' &&
      originType !== 'messenger'
    ) {
      throw new Error('Gig user source origin is invalid.');
    }
    return {
      type: 'user',
      userId: stringifyId(source.userId, 'source.userId'),
      origin: { type: originType },
    };
  }

  if (source.type === 'provider') {
    const provider = source.provider;
    if (
      !isRecord(provider) ||
      typeof provider.name !== 'string' ||
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
      type: 'provider',
      provider: {
        name: provider.name,
        externalEventId: provider.externalEventId,
        sourceUrl: provider.sourceUrl,
        fetchedAt: provider.fetchedAt,
        ...(provider.externalVersionId !== undefined
          ? { externalVersionId: provider.externalVersionId }
          : {}),
        ...(provider.providerUpdatedAt !== undefined
          ? { providerUpdatedAt: provider.providerUpdatedAt }
          : {}),
      },
    };
  }

  throw new Error(`Unsupported Gig source type: ${source.type}`);
}

export class GigRepositoryMapper {
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
      source: mapGigSource(doc.source),
      posts: doc.posts.map((post) => ({ ...post })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  static toGigs(docs: GigLeanDocument[]): PlainGig[] {
    return docs.map((doc) => GigRepositoryMapper.toGig(doc));
  }
}
