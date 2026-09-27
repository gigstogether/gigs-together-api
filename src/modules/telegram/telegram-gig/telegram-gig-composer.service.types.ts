import type { GigId, GigPost, PlainGig } from '../../gig/types/gig.types';

export interface ComposeGigPostEditParams {
  gig: PlainGig;
  post: GigPost;
  isMediaUpdateRequired: boolean;
  // Telegram accepts either a public URL or a bot-scoped file_id as replacement media.
  mediaReference?: string;
}

export interface BuildGigModerationReplyMarkupParams {
  gigId?: GigId;
  expectedVersion: number;
  isVisible: boolean;
  mainPostUrl?: string;
  editGigUrl?: string;
}

export interface BuildGigModerationCaptionPayload {
  title: string;
  gigUrl?: string;
  mainPostUrl?: string;
  adminGigUrl?: string;
}
