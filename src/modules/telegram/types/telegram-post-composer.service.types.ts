import type { GigId, PlainGig } from '../../gig/types/gig.types';
import type { Status } from '../../gig/types/status.enum';
import type { GigCandidateRecord } from '../../gig-candidate/types/gig-candidate.types';
import type { GigCandidateStatus } from '../../gig-candidate/types/gig-candidate-status.enum';
import type {
  TGChatId,
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageText,
  TGMessage,
  TGSendMediaGroup,
  TGSendMessage,
  TGSendPhoto,
} from './message.types';
import type { TGChat } from './chat.types';

export enum PostEditKind {
  Media = 'media',
  Caption = 'caption',
  Text = 'text',
}

export enum WeeklyDigestMainChannelSendKind {
  SendMessage = 'sendMessage',
  SendPhoto = 'sendPhoto',
  SendMediaGroup = 'sendMediaGroup',
}

export interface ComposeWeeklyDigestParams {
  readonly chatId: TGChatId;
  readonly gigs: readonly PlainGig[];
}

export type WeeklyDigestMainChannelSendPlan =
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendMessage;
      readonly payload: TGSendMessage;
    }
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendPhoto;
      readonly payload: TGSendPhoto;
    }
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendMediaGroup;
      readonly payload: TGSendMediaGroup;
    };

export type TelegramGigPostEditComposition =
  | { kind: PostEditKind.Media; payload: TGEditMessageMedia }
  | { kind: PostEditKind.Caption; payload: TGEditMessageCaption }
  | { kind: PostEditKind.Text; payload: TGEditMessageText };

export interface BuildCaptionPayload {
  date: string | number | Date;
  endDate?: string | number | Date;
  venue: string;
  title: string;
  ticketsUrl: string;
  url?: string;
}

export interface BuildGigPermalinkPayload {
  readonly baseUrl: string;
  readonly publicId: string;
}

interface GetPostUrlPayloadBaseParams {
  messageId: TGMessage['message_id'];
}

interface GetPostUrlPayloadByChatIdParams extends GetPostUrlPayloadBaseParams {
  chatId: TGChatId;
  chatUsername?: TGChat['username'];
}

interface GetPostUrlPayloadByChatUsernameParams extends GetPostUrlPayloadBaseParams {
  chatId?: TGChatId;
  chatUsername: TGChat['username'];
}

export type GetPostUrlPayload =
  GetPostUrlPayloadByChatIdParams | GetPostUrlPayloadByChatUsernameParams;

export interface BuildAfterPublishModerationReplyMarkupParams {
  readonly gigId?: GigId;
  readonly publishPostUrl?: string;
  readonly editGigUrl?: string;
}

export interface BuildPublishedModerationCaptionPayload {
  readonly title: string;
  readonly gigUrl?: string;
  readonly publishPostUrl?: string;
  readonly adminGigUrl?: string;
}

export interface BuildModerationStatusLinePayload {
  readonly status: SubmissionFeedbackStatus;
  readonly publishPostUrl?: string;
  readonly adminGigUrl?: string;
}

export interface BuildModerationCaptionPayload {
  readonly body: string;
  readonly status: SubmissionFeedbackStatus;
  readonly publishPostUrl?: string;
  readonly adminGigUrl?: string;
}

export type SubmissionFeedbackStatus =
  Status.Pending | Status.Published | Status.Rejected;

export type BuildSubmissionFeedbackCaptionPayload = {
  readonly body: string;
  readonly status: SubmissionFeedbackStatus;
};

export interface BuildRejectedModerationCaptionPayload {
  readonly body: string;
  readonly adminGigUrl?: string;
}

export interface ComposeGigCandidatePostEditParams {
  gigCandidate: GigCandidateRecord;
  chatId: number;
  messageId: number;
  fileId?: string;
}

export interface BuildGigCandidateCaptionParams {
  gigCandidate: GigCandidateRecord;
  status: GigCandidateStatus;
}

export interface ComposedText {
  plain: string;
  html: string;
}
