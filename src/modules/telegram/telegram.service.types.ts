import type { GigId, GigPost, PlainGig } from '../gig/types/gig.types';
import type { InputFileData, TGChatId, TGMessage } from './types/message.types';
import type { PostEditKind } from './telegram-post-composer.service.types';

export interface TelegramPostEditResult {
  kind: PostEditKind;
  message: TGMessage;
  fileId?: string;
}

export interface TelegramPostSendResult {
  messageId: number;
  chatId: number;
  sentAtSeconds: number;
  fileId?: string;
}

export interface TelegramPhotoPostSendResult extends TelegramPostSendResult {
  fileId: string;
}

export interface EditGigPostParams {
  gig: PlainGig;
  post: GigPost;
  isMediaUpdateRequired: boolean;
  mediaReference?: string;
  posterFile?: InputFileData;
}

export interface EditGigPostsParams {
  gig: PlainGig;
  isMediaUpdateRequired: boolean;
  posterFile?: InputFileData;
}

export interface EditedGigPost {
  post: GigPost;
  result: TelegramPostEditResult;
}

export interface EditGigPostsResult {
  moderation?: EditedGigPost;
  main?: EditedGigPost;
}

export interface UpdateGigModerationPostAfterEditParams {
  gig: PlainGig;
  moderationPost: GigPost;
  mainPost?: GigPost;
}

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
