import type { Status } from '../../gig/types/status.enum';
import type { GigCandidateRecord } from '../../gig-candidate/types/gig-candidate.types';
import type { TGChatId, TGMessage } from './message.types';
import type { GigId, PlainGig } from '../../gig/types/gig.types';

export interface EditSubmissionFeedbackPayload {
  gig: PlainGig;
  chatId: TGChatId;
  messageId: number;
  status: Status.Pending | Status.Published | Status.Rejected;
  url?: string;
}

export interface UpdateModerationPostAfterGigPublishedPayload {
  moderationPost: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
  gigId: GigId;
  title: string;
  publicId: string;
  publishPost?: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
}

export interface UpdatePublishedSubmissionFeedbackPayload {
  gig: PlainGig;
}

export interface HandlePostRejectPayload {
  gig: PlainGig;
  moderationMessage: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
}

export interface WeeklyDigestMainChannelPublishResult {
  readonly postUrl: string;
}

export interface UpdateGigCandidatePostParams {
  gigCandidate: GigCandidateRecord;
  chatId: number;
  messageId: number;
  fileId?: string;
}
