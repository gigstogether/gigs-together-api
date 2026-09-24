import type { TGChat } from './chat.types';
import type { TGUser } from './user.types';

export type TGChatId = string | number;

export enum TGParseMode {
  HTML = 'HTML',
  MarkdownV2 = 'MarkdownV2',
}

export interface TGMessage {
  message_id: number;
  from?: TGUser;
  chat: TGChat;
  text?: string; // UTF-8 text
  date: number;
  reply_to_message?: TGMessage;
  sender_chat?: TGChat;
  photo?: TGPhotoSize[];
}

export interface TGSendMessage {
  chat_id: TGChatId;
  text: string;
  parse_mode?: TGParseMode;
  disable_web_page_preview?: boolean;

  [key: string]: unknown;
}

export interface TGInaccessibleMessage {
  chat: TGChat;
  message_id: number;
  date: 0; // Always 0. The field can be used to differentiate regular and inaccessible messages.
}

export interface TGInlineKeyboardMarkup {
  inline_keyboard: TGInlineKeyboardButton[][];
}

interface TGInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TGEditMessageReplyMarkup {
  chatId?: TGChatId;
  messageId?: number;
  replyMarkup?: TGInlineKeyboardMarkup;
}

export interface TGEditMessageText {
  chatId?: TGChatId;
  messageId?: number;
  text?: string;
  parseMode?: TGParseMode;
  disableWebPagePreview?: boolean;
  replyMarkup?: TGInlineKeyboardMarkup;
}

export interface TGEditMessageCaption {
  chatId?: TGChatId;
  messageId?: number;
  caption?: string;
  parseMode?: TGParseMode;
  disableWebPagePreview?: boolean;
  replyMarkup?: TGInlineKeyboardMarkup;
}

export enum TGInputMediaType {
  Photo = 'photo',
  Video = 'video',
  Animation = 'animation',
  Audio = 'audio',
  Document = 'document',
}

export interface TGInputMedia {
  type: TGInputMediaType;
  media: string;
  caption?: string;
  parse_mode?: TGParseMode;
  show_caption_above_media?: boolean;
  has_spoiler?: boolean;
}

export interface TGSendMediaGroup {
  chat_id: TGChatId;
  media: TGInputMedia[];
  disable_notification?: boolean;
  protect_content?: boolean;
  message_thread_id?: number;
}

export interface TGEditMessageMedia {
  chatId?: TGChatId;
  messageId?: number;
  media?: TGInputMedia;
  replyMarkup?: TGInlineKeyboardMarkup;
}

export type InputFile =
  | Buffer
  // | Readable
  | { buffer: Buffer; filename: string; contentType?: string };

export interface TGSendPhoto {
  chat_id: TGChatId;
  photo: InputFile | string;
  caption?: string;
  parse_mode?: TGParseMode;
  reply_markup?: TGInlineKeyboardMarkup;
  business_connection_id?: string;
  message_thread_id?: number;
  direct_messages_topic_id?: number;
  disable_notification?: boolean;
  protect_content?: boolean;
  has_spoiler?: boolean;
  show_caption_above_media?: boolean;
}

// This object represents one size of a photo or a file / sticker thumbnail.
export interface TGPhotoSize {
  // Identifier for this file, which can be used to download or reuse the file
  file_id: string;
  // Unique identifier for this file, which is supposed to be the same over time
  // and for different bots. Can't be used to download or reuse the file.
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}
