import type { GigId } from './gig.types';
import type { TGChatId, TGMessage } from '../../telegram/types/message.types';

export interface GigModerationPostRef {
  readonly chatId: TGChatId;
  readonly messageId: TGMessage['message_id'];
}

interface ModerateGigBaseParams {
  readonly moderationPost?: GigModerationPostRef;
}

export interface ModerateGigByIdParams extends ModerateGigBaseParams {
  readonly gigId: GigId;
  readonly publicId?: never;
}

export interface ModerateGigByPublicIdParams extends ModerateGigBaseParams {
  readonly publicId: string;
  readonly gigId?: never;
}

export type ModerateGigParams =
  ModerateGigByIdParams | ModerateGigByPublicIdParams;
