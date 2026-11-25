import type {
  TGChatId,
  TGSendMediaGroup,
  TGSendMessage,
  TGSendPhoto,
} from '../telegram-bot-client/types/message.types';
import type { TelegramGigWithVenueNames } from '../telegram-gig/telegram-gig-composer.service.types';

export enum WeeklyDigestSendKind {
  SendMessage = 'sendMessage',
  SendPhoto = 'sendPhoto',
  SendMediaGroup = 'sendMediaGroup',
}

export interface ComposeWeeklyDigestParams {
  chatId: TGChatId;
  gigs: TelegramGigWithVenueNames[];
}

export interface WeeklyDigestMediaItemContext {
  position: number;
  publicId: string;
}

export type WeeklyDigestSendPlan =
  | {
      kind: WeeklyDigestSendKind.SendMessage;
      payload: TGSendMessage;
    }
  | {
      kind: WeeklyDigestSendKind.SendPhoto;
      payload: TGSendPhoto;
    }
  | {
      kind: WeeklyDigestSendKind.SendMediaGroup;
      payload: TGSendMediaGroup;
      mediaItems: WeeklyDigestMediaItemContext[];
    };
