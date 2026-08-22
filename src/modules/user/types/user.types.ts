import type { Messenger } from '../../gig/types/messenger.enum';

export type UserStatus = 'active' | 'anonymized';

export interface UserMessengerIdentity {
  type: 'messenger';
  messenger: Messenger;
  externalUserId: string;
  username?: string;
}

export type UserExternalIdentity = UserMessengerIdentity;

export interface User {
  id: string;
  status: UserStatus;
  identities: UserExternalIdentity[];
  displayName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindOrCreateMessengerUserParams {
  messenger: Messenger;
  externalUserId: string;
  username?: string;
  displayName?: string;
}
