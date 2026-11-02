import type { TGInaccessibleMessage, TGMessage } from './message.types';
import type { TGChat } from './chat.types';
import type { TGUser } from './user.types';

export interface TGUpdate {
  update_id: number;
  message?: TGMessage;
  edited_message?: TGMessage;
  callback_query?: TGCallbackQuery;
  channel_post?: TGChannelPost;

  [key: string]: unknown;
}

export interface TGCallbackQuery {
  id: string;
  from: TGUser;
  message?: TGMessage | TGInaccessibleMessage;
  inline_message_id?: string;
  data?: string;
}

export interface TGAnswerCallbackQuery {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
  url?: string;
}

interface TGChannelPost {
  message_id: number;
  sender_chat: TGChat;
  chat: TGChat;
  text: string;
}
