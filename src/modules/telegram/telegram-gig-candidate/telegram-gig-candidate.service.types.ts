import type {
  GigCandidate,
  GigCandidatePost,
} from '../../gig-candidate/types/gig-candidate.types';
import type {
  InputFileData,
  TGMessage,
  TGSendPhoto,
} from '../types/message.types';
import type { PostEditKind } from '../telegram-post-composer.service.types';

export interface TelegramGigCandidatePostEditResult {
  kind: PostEditKind;
  message: TGMessage;
  fileId?: string;
}

export interface TelegramGigCandidatePostSendResult {
  messageId: number;
  chatId: number;
  sentAtSeconds: number;
  fileId?: string;
}

export interface TelegramGigCandidatePhotoPostSendResult extends TelegramGigCandidatePostSendResult {
  fileId: string;
}

export interface SendGigCandidatePhotoParams {
  composed: TGSendPhoto;
  gigCandidateId: string;
  posterFile?: InputFileData;
}

export interface UpdateRejectedGigCandidatePostPayload {
  gigCandidate: GigCandidate;
  post: GigCandidatePost;
}

export interface EditGigCandidatePostParams {
  gigCandidate: GigCandidate;
  post: GigCandidatePost;
  isMediaUpdateRequired: boolean;
  posterFile?: InputFileData;
}
