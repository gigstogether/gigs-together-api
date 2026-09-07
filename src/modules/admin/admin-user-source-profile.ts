import { Messenger } from '../../shared/types/messenger.enum';
import type { User } from '../user/types/user.types';
import { UserRole } from '../user/types/user-role.enum';

export interface AdminUserSourceProfile {
  displayName?: string;
  isCurrentlyAdmin: boolean;
  telegramUsername?: string;
}

export function getAdminUserSourceProfile(
  user: User | undefined,
): AdminUserSourceProfile {
  const telegramIdentities =
    user?.identities.filter(
      (identity) => identity.messenger === Messenger.Telegram,
    ) ?? [];
  const telegramUsername =
    telegramIdentities.length === 1
      ? telegramIdentities[0].username
      : undefined;

  return {
    ...(user?.displayName !== undefined
      ? { displayName: user.displayName }
      : {}),
    isCurrentlyAdmin: user?.roles.includes(UserRole.Admin) ?? false,
    ...(telegramUsername !== undefined ? { telegramUsername } : {}),
  };
}
