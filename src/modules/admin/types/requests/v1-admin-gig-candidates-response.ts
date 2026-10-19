import type { GigCandidateStatus } from '../../../gig-candidate/types/gig-candidate-status.enum';
import type { Messenger } from '../../../../shared/types/messenger.enum';
import type { GigSourceType } from '../../../gig/types/gig-source-type.enum';
import type { GigSourceUserOriginType } from '../../../gig/types/gig-source-user-origin-type.enum';

interface V1AdminGigCandidateUserFormOriginResponseBody {
  type: GigSourceUserOriginType.Form;
}

interface V1AdminGigCandidateUserAdminOriginResponseBody {
  type: GigSourceUserOriginType.Admin;
}

interface V1AdminGigCandidateUserMessengerOriginResponseBody {
  type: GigSourceUserOriginType.Messenger;
  messenger: Messenger;
}

type V1AdminGigCandidateIdentifiedUserOriginResponseBody =
  | V1AdminGigCandidateUserFormOriginResponseBody
  | V1AdminGigCandidateUserAdminOriginResponseBody;

interface V1AdminGigCandidateUserSourceResponseBodyBase {
  type: GigSourceType.User;
  displayName?: string;
  isCurrentlyAdmin: boolean;
  telegramUsername?: string;
}

export interface V1AdminGigCandidateIdentifiedUserSourceResponseBody extends V1AdminGigCandidateUserSourceResponseBodyBase {
  userId: string;
  origin: V1AdminGigCandidateIdentifiedUserOriginResponseBody;
}

export interface V1AdminGigCandidateMessengerUserSourceResponseBody extends V1AdminGigCandidateUserSourceResponseBodyBase {
  userId?: string;
  origin: V1AdminGigCandidateUserMessengerOriginResponseBody;
}

type V1AdminGigCandidateUserSourceResponseBody =
  | V1AdminGigCandidateIdentifiedUserSourceResponseBody
  | V1AdminGigCandidateMessengerUserSourceResponseBody;

export interface V1AdminGigCandidateProviderReferenceResponseBody {
  name: string;
  externalEventId: string;
  externalVersionId?: string;
  sourceUrl: string;
  fetchedAt: string;
  providerUpdatedAt?: string;
}

interface V1AdminGigCandidateProviderSourceResponseBody {
  type: GigSourceType.Provider;
  provider: V1AdminGigCandidateProviderReferenceResponseBody;
}

export type V1AdminGigCandidateSourceResponseBody =
  | V1AdminGigCandidateUserSourceResponseBody
  | V1AdminGigCandidateProviderSourceResponseBody;

interface V1AdminGigCandidateGigDraftResponseBody {
  title?: string;
  date?: string;
  endDate?: string;
  city?: string;
  country?: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

export interface V1AdminGigCandidateOriginalMessageResponseBody {
  text: string;
  url: string;
}

export interface V1AdminGigCandidateResponseBody {
  id: string;
  source: V1AdminGigCandidateSourceResponseBody;
  gigDraft: V1AdminGigCandidateGigDraftResponseBody;
  status: GigCandidateStatus;
  version: number;
  originalMessage?: V1AdminGigCandidateOriginalMessageResponseBody;
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
