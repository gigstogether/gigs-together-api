import type { TGUser } from '../../telegram/types/user.types';

/** Authenticated API subject after JWT and/or Telegram WebApp initData resolution. */
export interface User {
  tgUser: TGUser;
  isAdmin: boolean;
}
