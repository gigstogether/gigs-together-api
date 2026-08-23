import type { Messenger } from '../../../shared/types/messenger.enum';
import type { UserRole } from './user-role.enum';

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
  roles: UserRole[];
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
