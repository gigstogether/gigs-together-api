import type {
  GigCandidatePoster,
  GigCandidatePost,
  GigCandidateRecord,
} from '../types/gig-candidate.types';
import type { GigCandidateSource } from '../types/gig-candidate-source.enum';
import type { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type { GigSuggestedBy } from '../../gig/types/gig.types';

export interface GigCandidateLeanDocument {
  _id: { toString(): string } | string;
  source: GigCandidateSource;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue?: string;
  ticketsUrl?: string;
  poster?: GigCandidatePoster;
  status: GigCandidateStatus;
  posts: GigCandidatePost[];
  suggestedBy: GigSuggestedBy;
  gigId?: { toString(): string } | string;
  createdAt: Date;
  updatedAt: Date;
}

export class GigCandidateRepositoryMapper {
  static toGigCandidateRecord(
    doc: GigCandidateLeanDocument,
  ): GigCandidateRecord {
    const id = typeof doc._id === 'string' ? doc._id : doc._id.toString();
    const gigId =
      doc.gigId === undefined
        ? undefined
        : typeof doc.gigId === 'string'
          ? doc.gigId
          : doc.gigId.toString();
    const poster = GigCandidateRepositoryMapper.toPoster(doc.poster);
    if (!Array.isArray(doc.posts)) {
      throw new Error(
        `GigCandidate ${id} is missing posts; expected an array at the storage boundary.`,
      );
    }
    const posts = doc.posts.map((post) =>
      GigCandidateRepositoryMapper.toPost(post),
    );

    return {
      id,
      source: doc.source,
      title: doc.title,
      date: doc.date,
      ...(doc.endDate !== undefined ? { endDate: doc.endDate } : {}),
      city: doc.city,
      country: doc.country,
      ...(doc.venue !== undefined ? { venue: doc.venue } : {}),
      ...(doc.ticketsUrl !== undefined ? { ticketsUrl: doc.ticketsUrl } : {}),
      ...(poster !== undefined ? { poster } : {}),
      status: doc.status,
      posts,
      suggestedBy: doc.suggestedBy,
      ...(gigId !== undefined ? { gigId } : {}),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private static toPoster(
    poster: GigCandidatePoster | undefined,
  ): GigCandidatePoster | undefined {
    if (!poster) {
      return undefined;
    }
    if (poster.bucketPath === undefined && poster.externalUrl === undefined) {
      return undefined;
    }
    return {
      ...(poster.bucketPath !== undefined
        ? { bucketPath: poster.bucketPath }
        : {}),
      ...(poster.externalUrl !== undefined
        ? { externalUrl: poster.externalUrl }
        : {}),
    };
  }

  private static toPost(post: GigCandidatePost): GigCandidatePost {
    return {
      to: post.to,
      type: post.type,
      date: post.date,
      id: post.id,
      chatId: post.chatId,
      ...(post.fileId !== undefined ? { fileId: post.fileId } : {}),
    };
  }
}
