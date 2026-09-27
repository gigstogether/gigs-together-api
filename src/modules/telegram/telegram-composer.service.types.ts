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

interface BuildPostUrlPayloadBaseParams {
  messageId: TGMessage['message_id'];
}

interface BuildPostUrlPayloadByChatIdParams extends BuildPostUrlPayloadBaseParams {
  chatId: TGChatId;
  chatUsername?: TGChat['username'];
}

interface BuildPostUrlPayloadByChatUsernameParams extends BuildPostUrlPayloadBaseParams {
  chatId?: TGChatId;
  chatUsername: TGChat['username'];
}

export type BuildPostUrlPayload =
  BuildPostUrlPayloadByChatIdParams | BuildPostUrlPayloadByChatUsernameParams;
