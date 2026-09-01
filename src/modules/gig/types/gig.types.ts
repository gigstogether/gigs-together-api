import type { Types } from 'mongoose';
import type { TGUser } from '../../telegram/types/user.types';
import type { TGMessage } from '../../telegram/types/message.types';
import type { Status } from './status.enum';
import type { GigPost, GigPoster } from '../gig.schema';
import type { ProviderReference } from '../../gig-candidate/types/gig-candidate.types';

export type GigId = string | Types.ObjectId;

/** Plain gig payload from MongoDB. */
export interface PlainGig {
  _id: Types.ObjectId;
  publicId: string;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: GigPoster;
  status: Status;
  isVisible: boolean;
  version: number;
  posts: GigPost[];
  suggestedBy: GigSuggestedBy;
  gigCandidateId?: Types.ObjectId;
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

export interface GigData {
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: GigPosterInput;
}

export interface GigSourceUserOrigin {
  type: 'form' | 'admin' | 'messenger';
}

export interface GigSourceUser {
  type: 'user';
  userId: string;
  origin: GigSourceUserOrigin;
}

export interface GigSourceProvider {
  type: 'provider';
  provider: ProviderReference;
}

export type GigSource = GigSourceUser | GigSourceProvider;

export interface GigCalendarSource {
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
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
  isVisible: boolean;
  version: number;
  suggestedBy: GigFormDataSuggestedBy;
  publishPostUrl?: string;
  publishPostDate?: number;
  moderationPostUrl?: string;
  moderationPostDate?: number;
}
