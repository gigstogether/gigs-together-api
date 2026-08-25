import type { GigData } from '../../gig/types/gig.types';
import type { Messenger } from '../../../shared/types/messenger.enum';
import type { GigCandidatePostType } from './gig-candidate-post-type.enum';
import type { GigCandidateStatus } from './gig-candidate-status.enum';
import type {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate-list-sort';
import type { GigPosterFile } from '../../gig/types/gig-poster.types';

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

export type GigCandidateAttachment = Record<string, unknown>;

export interface GigCandidateSourceUserFormOrigin {
  type: 'form';
}

export interface GigCandidateSourceUserAdminOrigin {
  type: 'admin';
}

export interface GigCandidateSourceUserMessengerOrigin {
  type: 'messenger';
  messenger: Messenger;
  conversationId: string;
  messageId: string;
}

export type GigCandidateSourceUserOrigin =
  | GigCandidateSourceUserFormOrigin
  | GigCandidateSourceUserAdminOrigin
  | GigCandidateSourceUserMessengerOrigin;

export interface GigCandidateSourceUser {
  type: 'user';
  userId: string;
  origin: GigCandidateSourceUserOrigin;
  originalText?: string;
  attachments?: GigCandidateAttachment[];
}

export interface ProviderReference {
  name: 'setlistFm';
  externalEventId: string;
  externalVersionId?: string;
  sourceUrl: string;
  fetchedAt: Date;
  providerUpdatedAt?: Date;
}

export interface GigCandidateSourceProvider {
  type: 'provider';
  provider: ProviderReference;
}

export type GigCandidateSource =
  GigCandidateSourceUser | GigCandidateSourceProvider;

export interface GigCandidate {
  id: string;
  status: GigCandidateStatus;
  version: number;
  source: GigCandidateSource;
  gigDraft: Partial<GigData>;
  posts: GigCandidatePost[];
  gigId?: string;
  approvedAt?: Date;
  approvedByUserId?: string;
  rejectedAt?: Date;
  rejectedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGigCandidateParams {
  gigCandidateId: string;
  status: GigCandidateStatus.New | GigCandidateStatus.Reviewing;
  source: GigCandidateSourceUser;
  gigDraft: Partial<GigData>;
}

export interface UpdateGigCandidateDraftParams {
  gigCandidateId: string;
  expectedVersion: number;
  gigDraft: Partial<GigData>;
}

export interface SendGigCandidateToModerationParams {
  gigCandidateId: string;
  expectedVersion: number;
}

export interface RejectGigCandidateParams {
  gigCandidateId: string;
  expectedVersion: number;
  rejectedByUserId: string;
}

export interface RejectGigCandidateRecordParams extends RejectGigCandidateParams {
  rejectedAt: Date;
}

export interface AppendGigCandidatePostParams {
  gigCandidateId: string;
  expectedVersion: number;
  post: GigCandidatePost;
}

export interface FindGigCandidatesParams {
  status: GigCandidateStatus;
  limit: number;
  sortBy?: AdminGigCandidateListSortBy;
  sortOrder?: AdminGigCandidateListSortOrder;
}

export interface CreateAdminGigCandidateParams {
  userId: string;
  gigDraft: Partial<GigData>;
  posterUrl?: string;
  posterFile?: GigPosterFile;
}

export interface UpdateAdminGigCandidateDraftParams {
  gigCandidateId: string;
  expectedVersion: number;
  gigDraft: Partial<GigData>;
  posterUrl?: string;
  posterFile?: GigPosterFile;
}

export interface LookupGigCandidateDraftParams {
  title: string;
  location: string;
}

export interface GigCandidateDraftLookupResult {
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterUrl?: string;
}
