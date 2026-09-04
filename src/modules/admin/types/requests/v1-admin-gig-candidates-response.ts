import type { GigCandidateStatus } from '../../../gig-candidate/types/gig-candidate-status.enum';
import type { Messenger } from '../../../../shared/types/messenger.enum';

export interface V1AdminGigCandidateUserFormOriginResponseBody {
  type: 'form';
}

export interface V1AdminGigCandidateUserAdminOriginResponseBody {
  type: 'admin';
}

export interface V1AdminGigCandidateUserMessengerOriginResponseBody {
  type: 'messenger';
  messenger: Messenger;
}

export type V1AdminGigCandidateUserOriginResponseBody =
  | V1AdminGigCandidateUserFormOriginResponseBody
  | V1AdminGigCandidateUserAdminOriginResponseBody
  | V1AdminGigCandidateUserMessengerOriginResponseBody;

export interface V1AdminGigCandidateUserSourceResponseBody {
  type: 'user';
  userId: string;
  origin: V1AdminGigCandidateUserOriginResponseBody;
  originalText?: string;
  attachments?: Record<string, unknown>[];
}

export interface V1AdminGigCandidateProviderReferenceResponseBody {
  name: string;
  externalEventId: string;
  externalVersionId?: string;
  sourceUrl: string;
  fetchedAt: string;
  providerUpdatedAt?: string;
}

export interface V1AdminGigCandidateProviderSourceResponseBody {
  type: 'provider';
  provider: V1AdminGigCandidateProviderReferenceResponseBody;
}

export type V1AdminGigCandidateSourceResponseBody =
  | V1AdminGigCandidateUserSourceResponseBody
  | V1AdminGigCandidateProviderSourceResponseBody;

export interface V1AdminGigCandidateGigDraftResponseBody {
  title?: string;
  date?: string;
  endDate?: string;
  city?: string;
  country?: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

export interface V1AdminGigCandidateResponseBody {
  id: string;
  source: V1AdminGigCandidateSourceResponseBody;
  gigDraft: V1AdminGigCandidateGigDraftResponseBody;
  status: GigCandidateStatus;
  version: number;
  intakePostUrl?: string;
  intakePostDate?: number;
  moderationPostUrl?: string;
  moderationPostDate?: number;
  linkedGigPublicId?: string;
  approvedAt?: string;
  approvedByUserId?: string;
  rejectedAt?: string;
  rejectedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface V1AdminGigCandidatesListResponseBody {
  gigCandidates: V1AdminGigCandidateResponseBody[];
}
