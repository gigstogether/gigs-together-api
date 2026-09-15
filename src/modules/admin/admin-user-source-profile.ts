import { Messenger } from '../../shared/types/messenger.enum';
import type { User } from '../user/types/user.types';
import { UserRole } from '../user/types/user-role.enum';

export interface UserSourceProfile {
  displayName?: string;
  isCurrentlyAdmin: boolean;
  telegramUsername?: string;
}

export function getUserSourceProfile(
  user: User | undefined,
): UserSourceProfile {
  const telegramIdentities =
    user?.identities.filter(
      (identity) => identity.messenger === Messenger.Telegram,
    ) ?? [];
  if (telegramIdentities.length > 1) {
    throw new Error('A User can have only one Telegram identity');
  }

  const userSourceProfile: UserSourceProfile = {
    isCurrentlyAdmin: user?.roles.includes(UserRole.Admin) ?? false,
  };
  if (user?.displayName !== undefined) {
    userSourceProfile.displayName = user.displayName;
  }
  const telegramUsername = telegramIdentities[0]?.username;
  if (telegramUsername !== undefined) {
    userSourceProfile.telegramUsername = telegramUsername;
  }
  return userSourceProfile;
}
