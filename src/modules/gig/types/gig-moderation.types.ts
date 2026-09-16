import type { GigId } from './gig.types';
import type { TGChatId, TGMessage } from '../../telegram/types/message.types';

export interface GigModerationPostRef {
  readonly chatId: TGChatId;
  readonly messageId: TGMessage['message_id'];
}

export interface SetGigVisibilityParams {
  readonly gigId: GigId;
  readonly expectedVersion: number;
  readonly isVisible: boolean;
  readonly moderationPost: GigModerationPostRef;
}

interface CreateGigMainPostBaseParams {
  readonly moderationPost?: GigModerationPostRef;
  readonly expectedVersion: number;
}

export interface CreateGigMainPostByIdParams extends CreateGigMainPostBaseParams {
  readonly gigId: GigId;
  readonly publicId?: never;
}

export interface CreateGigMainPostByPublicIdParams extends CreateGigMainPostBaseParams {
  readonly publicId: string;
  readonly gigId?: never;
}

export type CreateGigMainPostParams =
  CreateGigMainPostByIdParams | CreateGigMainPostByPublicIdParams;
