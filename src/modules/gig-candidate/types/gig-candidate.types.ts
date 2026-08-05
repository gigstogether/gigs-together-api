import type { GigSuggestedBy } from '../../gig/types/gig.types';
import type { Messenger } from '../../gig/types/messenger.enum';
import type { GigCandidatePostType } from './gig-candidate-post-type.enum';
import type { GigCandidateSource } from './gig-candidate-source.enum';
import type { GigCandidateStatus } from './gig-candidate-status.enum';

export interface GigCandidatePoster {
  bucketPath?: string;
  externalUrl?: string;
}

export interface GigCandidatePost {
  to: Messenger;
  type: GigCandidatePostType;
  date: number;
  id: number;
  chatId: number;
  fileId?: string;
}

export interface GigCandidateRecord {
  id: string;
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
  gigId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGigCandidateRecordParams {
  id: string;
  source: GigCandidateSource;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue?: string;
  ticketsUrl?: string;
  poster?: GigCandidatePoster;
  suggestedBy: GigSuggestedBy;
}

export interface AppendGigCandidatePostParams {
  id: string;
  post: GigCandidatePost;
}

export interface MarkGigCandidateAcceptedParams {
  id: string;
  gigId: string;
}

export interface MarkGigCandidateRejectedParams {
  id: string;
}
