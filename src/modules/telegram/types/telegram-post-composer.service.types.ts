import type { GigId, PlainGig } from '../../gig/types/gig.types';
import type {
  GigCandidate,
  GigCandidatePost,
} from '../../gig-candidate/types/gig-candidate.types';
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

export interface WeeklyDigestMediaItemContext {
  position: number;
  publicId: string;
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
      readonly mediaItems: WeeklyDigestMediaItemContext[];
    };

export type TelegramGigPostEditComposition =
  | { kind: PostEditKind.Media; payload: TGEditMessageMedia }
  | { kind: PostEditKind.Caption; payload: TGEditMessageCaption }
  | { kind: PostEditKind.Text; payload: TGEditMessageText };

export type TelegramGigCandidatePostEditComposition =
  | { kind: PostEditKind.Media; payload: TGEditMessageMedia }
  | { kind: PostEditKind.Caption; payload: TGEditMessageCaption };

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

export interface BuildGigModerationReplyMarkupParams {
  readonly gigId?: GigId;
  readonly expectedVersion: number;
  readonly isVisible: boolean;
  readonly mainPostUrl?: string;
  readonly editGigUrl?: string;
}

export interface BuildGigModerationCaptionPayload {
  readonly title: string;
  readonly gigUrl?: string;
  readonly mainPostUrl?: string;
  readonly adminGigUrl?: string;
}

export interface BuildModerationCaptionPayload {
  body: string;
  mainPostUrl?: string;
  adminGigUrl?: string;
}

export interface BuildModerationLinksParams {
  mainPostUrl?: string;
  adminGigUrl?: string;
}

export interface BuildGigCandidateCaptionParams {
  gigCandidate: GigCandidate;
  channelPurpose: 'intake' | 'moderation';
  moderationPost?: GigCandidatePost;
}

export interface GigCandidateFeedbackMessageWithTitleContent {
  kind: 'submitted' | 'acceptedForModeration' | 'rejected';
  title: string;
}

export interface GigCandidateFeedbackMessageWithPublicLinkContent {
  kind: 'acceptedWithPublicLink';
  publicId: string;
  title: string;
}

export type GigCandidateFeedbackMessageContent =
  | GigCandidateFeedbackMessageWithTitleContent
  | GigCandidateFeedbackMessageWithPublicLinkContent;

export type ComposeGigCandidateFeedbackMessageParams =
  GigCandidateFeedbackMessageContent & {
    chatId: TGChatId;
  };

export interface ComposeRejectedGigCandidatePostEditParams {
  gigCandidate: GigCandidate;
  post: GigCandidatePost;
}

export interface ComposeGigCandidateIntakePostAfterModerationEditParams {
  gigCandidate: GigCandidate;
  intakePost: GigCandidatePost;
  moderationPost: GigCandidatePost;
}

export interface ComposeGigCandidateModerationPostEditParams {
  gigCandidate: GigCandidate;
  moderationPost: GigCandidatePost;
  isMediaUpdateRequired: boolean;
}

export interface ComposedText {
  plain: string;
  html: string;
}
