import type { GigData } from '../../gig/types/gig.types';
import type { PostType } from '../../../shared/types/post-type.enum';
import type { Messenger } from '../../../shared/types/messenger.enum';
import type { GigCandidateStatus } from './gig-candidate-status.enum';
import type { ProviderReference } from '../../../shared/types/provider-reference.types';

interface GigCandidatePostBase {
  to: Messenger;
  date: number;
  id: number;
  chatId: number;
}

export interface GigCandidateTextPost extends GigCandidatePostBase {
  type: PostType.Intake;
  fileId?: never;
}

export interface GigCandidatePhotoPost extends GigCandidatePostBase {
  type: PostType.Intake | PostType.Moderation;
  fileId: string;
}

export type GigCandidatePost = GigCandidateTextPost | GigCandidatePhotoPost;

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
  // chatId: string;
  // messageId: string;
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
