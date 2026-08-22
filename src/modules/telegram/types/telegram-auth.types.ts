import type { TGUser } from './user.types';

export interface TelegramAuthenticationResult {
  tgUser: TGUser;
  isAdmin: boolean;
}
