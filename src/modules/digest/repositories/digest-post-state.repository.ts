import type { DigestPostState } from '../types/digest.types';

export const DIGEST_POST_STATE_REPOSITORY = Symbol(
  'DIGEST_POST_STATE_REPOSITORY',
);

export interface SaveSuccessfulDigestPostParams {
  postedAt: Date;
  postUrl: string;
}

export interface DigestPostStateRepository {
  findCurrent(): Promise<DigestPostState | null>;

  saveSuccessfulPost(params: SaveSuccessfulDigestPostParams): Promise<void>;
}
