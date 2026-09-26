import type { PlainGig } from '../../gig/types/gig.types';
import type {
  TGChatId,
  TGSendMediaGroup,
  TGSendMessage,
  TGSendPhoto,
} from '../types/message.types';

export enum WeeklyDigestSendKind {
  SendMessage = 'sendMessage',
  SendPhoto = 'sendPhoto',
  SendMediaGroup = 'sendMediaGroup',
}

export interface ComposeWeeklyDigestParams {
  chatId: TGChatId;
  gigs: PlainGig[];
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
