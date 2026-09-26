import type { GigId, GigPost, PlainGig } from '../gig/types/gig.types';
import type { TGChat } from './types/chat.types';
import type {
  TGChatId,
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageText,
  TGMessage,
} from './types/message.types';

export enum PostEditKind {
  Media = 'media',
  Caption = 'caption',
  Text = 'text',
}

export type TelegramPostEditComposition =
  | { kind: PostEditKind.Media; payload: TGEditMessageMedia }
  | { kind: PostEditKind.Caption; payload: TGEditMessageCaption }
  | { kind: PostEditKind.Text; payload: TGEditMessageText };

export interface ComposeGigPostEditParams {
  gig: PlainGig;
  post: GigPost;
  isMediaUpdateRequired: boolean;
  // Telegram accepts either a public URL or a bot-scoped file_id as replacement media.
  mediaReference?: string;
}

export interface BuildCaptionPayload {
  date: string | number | Date;
  endDate?: string | number | Date;
  venue: string;
  title: string;
  ticketsUrl: string;
  url?: string;
}

export interface BuildGigPermalinkPayload {
  baseUrl: string;
  publicId: string;
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
