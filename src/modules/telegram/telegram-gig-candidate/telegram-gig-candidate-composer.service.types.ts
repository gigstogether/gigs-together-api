import type {
  GigCandidate,
  GigCandidatePost,
} from '../../gig-candidate/types/gig-candidate.types';
import type { TGChatId, TGInlineKeyboardMarkup } from '../types/message.types';

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
  channelPurpose: 'intake';
}

interface ComposeGigCandidateModerationChannelPostParams extends ComposeGigCandidateChannelPostBaseParams {
  channelPurpose: 'moderation';
}

export type ComposeGigCandidateChannelPostParams =
  | ComposeGigCandidateIntakeChannelPostParams
  | ComposeGigCandidateModerationChannelPostParams;

interface BuildGigCandidateCaptionBaseParams {
  gigCandidate: GigCandidate;
}

interface BuildGigCandidateIntakeCaptionParams extends BuildGigCandidateCaptionBaseParams {
  channelPurpose: 'intake';
  moderationPost?: GigCandidatePost;
}

interface BuildGigCandidateModerationCaptionParams extends BuildGigCandidateCaptionBaseParams {
  channelPurpose: 'moderation';
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
