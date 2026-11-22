import type {
  GigCandidate,
  GigCandidateLocation,
  GigCandidatePost,
} from '../../gig-candidate/types/gig-candidate.types';
import type {
  InputFileData,
  TGMessage,
  TGSendPhoto,
} from '../telegram-bot-client/types/message.types';
import type { PostEditKind } from '../telegram-composer.service.types';

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

export interface SendGigCandidateModerationPostParams {
  gigCandidate: GigCandidate;
  location?: GigCandidateLocation;
  posterFile?: InputFileData;
}

export interface UpdateRejectedGigCandidatePostPayload {
  gigCandidate: GigCandidate;
  location?: GigCandidateLocation;
  post: GigCandidatePost;
}

export interface EditGigCandidatePostParams {
  gigCandidate: GigCandidate;
  location?: GigCandidateLocation;
  post: GigCandidatePost;
  isMediaUpdateRequired: boolean;
  posterFile?: InputFileData;
}
