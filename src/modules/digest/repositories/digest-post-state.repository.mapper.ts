import type { DigestPostState } from '../types/digest.types';

export interface DigestPostStateLeanDocument {
  postedAt: unknown;
  postUrl: unknown;
}

export class DigestPostStateRepositoryMapper {
  static toDigestPostState(doc: DigestPostStateLeanDocument): DigestPostState {
    if (
      !(doc.postedAt instanceof Date) ||
      Number.isNaN(doc.postedAt.getTime())
    ) {
      throw new Error('Digest post state postedAt must be a valid Date');
    }
    if (typeof doc.postUrl !== 'string' || doc.postUrl.trim().length === 0) {
      throw new Error('Digest post state postUrl must be a non-empty string');
    }

    return {
      postedAt: doc.postedAt,
      postUrl: doc.postUrl,
    };
  }
}
