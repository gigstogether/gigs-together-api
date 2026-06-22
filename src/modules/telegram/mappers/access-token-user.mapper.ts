import type {
  TelegramAccessTokenIdentity,
  TelegramIdentitySnapshot,
} from '../../auth/types/access-token-identity.types';
import type { TGUser } from '../types/user.types';

/**
 * Maps a Telegram {@link TGUser} into a neutral access-token identity for JWT signing.
 */
export function tgUserToTelegramAccessIdentity(
  tg: TGUser,
): TelegramAccessTokenIdentity {
  const { id, first_name, username, language_code, is_bot, ...rest } = tg;
  const extraKeys = Object.keys(rest);
  const snapshot: TelegramIdentitySnapshot = {
    firstName: first_name,
    username,
    languageCode: language_code,
    isBot: is_bot,
    ...(extraKeys.length > 0 ? { extra: rest } : {}),
  };
  return {
    kind: 'telegram',
    telegramUserId: id,
    snapshot,
  };
}
