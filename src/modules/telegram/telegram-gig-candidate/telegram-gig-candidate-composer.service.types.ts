import type { PostType } from '@shared/types/post-type.enum';
import type {
  GigCandidate,
  GigCandidatePost,
} from '../../gig-candidate/types/gig-candidate.types';
import type { TGChatId, TGInlineKeyboardMarkup } from '../types/message.types';

export interface GigCandidateFeedbackGigTitleSubject {
  type: 'gigTitle';
  title: string;
}

export interface GigCandidateFeedbackChatMessageSubject {
  type: 'chatMessage';
  chatId: number;
  messageId: number;
}

type GigCandidateFeedbackSubject =
  GigCandidateFeedbackGigTitleSubject | GigCandidateFeedbackChatMessageSubject;

interface GigCandidateSubmittedFeedbackMessageContent {
  kind: 'submitted';
  subject: GigCandidateFeedbackGigTitleSubject;
}

interface GigCandidateAcceptedForModerationFeedbackMessageContent {
  kind: 'acceptedForModeration';
  subject: GigCandidateFeedbackSubject;
}

interface GigCandidateRejectedFeedbackMessageContent {
  kind: 'rejected';
  subject: GigCandidateFeedbackSubject;
}

export type GigCandidateLifecycleFeedbackMessageContent =
  | GigCandidateSubmittedFeedbackMessageContent
  | GigCandidateAcceptedForModerationFeedbackMessageContent
  | GigCandidateRejectedFeedbackMessageContent;

export interface GigCandidateFeedbackMessageWithPublicLinkContent {
  kind: 'acceptedWithPublicLink';
  publicId: string;
  subject: GigCandidateFeedbackGigTitleSubject;
}

export type GigCandidateFeedbackMessageContent =
  | GigCandidateLifecycleFeedbackMessageContent
  | GigCandidateFeedbackMessageWithPublicLinkContent;

export type ComposeGigCandidateFeedbackMessageParams =
  GigCandidateFeedbackMessageContent & {
    chatId: TGChatId;
  };

export interface ComposeGigCandidateIntakePostAfterModerationEditParams {
  gigCandidate: GigCandidate;
  intakePost: GigCandidatePost;
  moderationPost: GigCandidatePost;
}

export interface ComposeGigCandidatePostEditParams {
  gigCandidate: GigCandidate;
  post: GigCandidatePost;
  isMediaUpdateRequired: boolean;
}

export interface ComposeRejectedGigCandidatePostEditParams {
  gigCandidate: GigCandidate;
  post: GigCandidatePost;
}

interface ComposeGigCandidateChannelPostBaseParams {
  gigCandidate: GigCandidate;
  chatId: string;
  replyMarkup: TGInlineKeyboardMarkup;
}

interface ComposeGigCandidateIntakeChannelPostParams extends ComposeGigCandidateChannelPostBaseParams {
  postType: PostType.Intake;
}

interface ComposeGigCandidateModerationChannelPostParams extends ComposeGigCandidateChannelPostBaseParams {
  postType: PostType.Moderation;
}

export type ComposeGigCandidateChannelPostParams =
  | ComposeGigCandidateIntakeChannelPostParams
  | ComposeGigCandidateModerationChannelPostParams;

interface BuildGigCandidateCaptionBaseParams {
  gigCandidate: GigCandidate;
}

interface BuildGigCandidateIntakeCaptionParams extends BuildGigCandidateCaptionBaseParams {
  postType: PostType.Intake;
  moderationPost?: GigCandidatePost;
}

interface BuildGigCandidateModerationCaptionParams extends BuildGigCandidateCaptionBaseParams {
  postType: PostType.Moderation;
  moderationPost?: never;
}

export type BuildGigCandidateCaptionParams =
  | BuildGigCandidateIntakeCaptionParams
  | BuildGigCandidateModerationCaptionParams;

export interface BuildGigCandidateModerationReplyMarkupParams {
  gigCandidate: GigCandidate;
  expectedVersion: number;
}

export interface ComposeGigCandidateExistingPostEditParams {
  post: GigCandidatePost;
  text: string;
  replyMarkup: TGInlineKeyboardMarkup;
}
