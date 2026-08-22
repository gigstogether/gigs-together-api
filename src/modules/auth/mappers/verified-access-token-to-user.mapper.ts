import { UnauthorizedException } from '@nestjs/common';
import type {
  TelegramAccessTokenIdentity,
  VerifiedAccessToken,
} from '../types/access-token-identity.types';
import type { User } from '../types/user.types';
import type { TGUser } from '../../telegram/types/user.types';

function telegramAccessIdentityToTgUser(
  identity: TelegramAccessTokenIdentity,
): TGUser {
  return {
    id: identity.telegramUserId,
    first_name: identity.snapshot.firstName,
    username: identity.snapshot.username,
    language_code: identity.snapshot.languageCode,
    is_bot: identity.snapshot.isBot,
    ...(identity.snapshot.extra ?? {}),
  };
}

/**
 * Maps a verified access token to the API {@link User} shape used by pipes and handlers.
 */
export function verifiedAccessTokenToUser(verified: VerifiedAccessToken): User {
  if (verified.identity.kind === 'telegram') {
    return {
      userId: verified.userId,
      tgUser: telegramAccessIdentityToTgUser(verified.identity),
      isAdmin: verified.isAdmin,
    };
  }
  throw new UnauthorizedException('Unsupported access token identity');
}
