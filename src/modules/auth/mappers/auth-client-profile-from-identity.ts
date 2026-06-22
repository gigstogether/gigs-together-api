import type { AccessTokenIdentityPayload } from '../types/access-token-identity.types';
import type { AuthClientProfile } from '../types/auth-client-profile.types';
import { isRecord } from '../../../shared/utils/is-record';

/**
 * Builds {@link AuthClientProfile} from a verified access/refresh identity (e.g. after JWT verify).
 */
export function authClientProfileFromAccessTokenIdentity(
  identity: AccessTokenIdentityPayload,
  isAdmin: boolean,
): AuthClientProfile {
  if (identity.kind !== 'telegram') {
    throw new Error('Unsupported identity for client profile');
  }
  const snap = identity.snapshot;
  const username = snap.username;
  const displayLabel =
    typeof username === 'string' && username.trim()
      ? `@${username.trim()}`
      : snap.firstName;

  const extra = snap.extra;
  let photoUrl: string | undefined;
  if (isRecord(extra) && 'photo_url' in extra) {
    const raw = extra.photo_url;
    if (typeof raw === 'string' && raw.trim()) {
      const url = raw.trim();
      if (/^https:\/\//i.test(url)) {
        photoUrl = url;
      }
    }
  }

  return {
    displayLabel,
    ...(photoUrl ? { photoUrl } : {}),
    isAdmin,
  };
}
