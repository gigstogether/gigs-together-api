import type { TGUser } from '../../telegram/telegram-bot-client/types/user.types';

/** Authenticated API subject after JWT and/or Telegram WebApp initData resolution. */
export interface User {
  userId: string;
  tgUser: TGUser;
  isAdmin: boolean;
}
