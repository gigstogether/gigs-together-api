import type { TGChatId, TGMessage } from './message.types';
import type { GigId } from '../../gig/types/gig.types';
import type {
  GigCandidate,
  GigCandidatePost,
} from '../../gig-candidate/types/gig-candidate.types';

export interface UpdateGigModerationPostPayload {
  moderationPost: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
  gigId: GigId;
  expectedVersion: number;
  isVisible: boolean;
  title: string;
  publicId: string;
  mainPost?: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
}

export interface WeeklyDigestMainChannelPublishResult {
  readonly postUrl: string;
}

export interface UpdateRejectedGigCandidatePostPayload {
  gigCandidate: GigCandidate;
  post: GigCandidatePost;
}
