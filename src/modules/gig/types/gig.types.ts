import type { Types } from 'mongoose';
import type { TGUser } from '../../telegram/types/user.types';
import type { TGMessage } from '../../telegram/types/message.types';
import type { Status } from './status.enum';
import type { GigPost, GigPoster } from '../gig.schema';

export type GigId = string | Types.ObjectId;

/** Plain gig payload from MongoDB. */
export interface PlainGig {
  readonly _id: Types.ObjectId;
  readonly publicId: string;
  readonly title: string;
  readonly date: number;
  readonly endDate?: number;
  readonly city: string;
  readonly country: string;
  readonly venue: string;
  readonly ticketsUrl: string;
  readonly poster?: GigPoster;
  readonly status: Status;
  readonly posts: GigPost[];
  readonly suggestedBy: GigSuggestedBy;
  readonly gigCandidateId?: Types.ObjectId;
}

export interface V1GetGigsResponseBodyGig {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  calendarUrl: string;
  posterUrl?: string;
  postUrl?: string;
}

export interface GigPosterInput {
  bucketPath?: string;
  externalUrl?: string;
}

export interface CreateGigInput {
  title: string;
  publicId: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: GigPosterInput;
  suggestedBy: GigSuggestedBy;
}

export interface CreateGigFromGigCandidateParams {
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue?: string;
  ticketsUrl?: string;
  poster?: GigPosterInput;
  suggestedBy: GigSuggestedBy;
  gigCandidateId: string;
}

export interface GigModerationPostInput {
  id: number;
  chatId: number;
  date: number;
  fileId?: string;
}

export interface SetPendingWithOptionalModerationPostParams {
  gigId: string;
  moderationPost?: GigModerationPostInput;
}

export interface GigSuggestedBy {
  userId: TGUser['id'];
  name?: string;
  username?: TGUser['username'];
  feedbackMessageId?: TGMessage['message_id'];
}

export interface GigFormDataSuggestedBy {
  userId: string;
  name?: string;
  username?: string;
}

export interface GigFormData {
  publicId: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterUrl?: string;
  status: Status;
  suggestedBy: GigFormDataSuggestedBy;
  publishPostUrl?: string;
  publishPostDate?: number;
  moderationPostUrl?: string;
  moderationPostDate?: number;
}
