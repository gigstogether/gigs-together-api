import type { GigData } from '../../gig/types/gig.types';
import type { PostType } from '../../../shared/types/post-type.enum';
import type { Messenger } from '../../../shared/types/messenger.enum';
import type { GigCandidateStatus } from './gig-candidate-status.enum';
import type { ProviderReference } from '../../../shared/types/provider-reference.types';
import type { GigSourceType } from '../../gig/types/gig-source-type.enum';
import type { GigSourceUserOriginType } from '../../gig/types/gig-source-user-origin-type.enum';

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

interface GigCandidateSourceUserFormOrigin {
  type: GigSourceUserOriginType.Form;
}

interface GigCandidateSourceUserAdminOrigin {
  type: GigSourceUserOriginType.Admin;
}

type GigCandidateSourceIdentifiedUserOrigin =
  GigCandidateSourceUserFormOrigin | GigCandidateSourceUserAdminOrigin;

export interface GigCandidateSourceIdentifiedUser {
  type: GigSourceType.User;
  userId: string;
  origin: GigCandidateSourceIdentifiedUserOrigin;
}

interface GigCandidateSourceMessengerMessage {
  chatId: number;
  messageId: number;
}

interface GigCandidateSourceUserMessengerOrigin {
  type: GigSourceUserOriginType.Messenger;
  messenger: Messenger;
  message: GigCandidateSourceMessengerMessage;
}

export interface GigCandidateSourceMessengerUser {
  type: GigSourceType.User;
  userId?: string;
  origin: GigCandidateSourceUserMessengerOrigin;
  originalText: string;
}

export type GigCandidateSourceUser =
  GigCandidateSourceIdentifiedUser | GigCandidateSourceMessengerUser;

export interface GigCandidateSourceProvider {
  type: GigSourceType.Provider;
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
