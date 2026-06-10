/**
 * Public client profile for auth-related JSON responses (no secrets).
 */
export interface AuthClientProfile {
  readonly displayLabel: string;
  readonly photoUrl?: string;
  readonly isAdmin: boolean;
}

/**
 * Standard JSON body when only a client profile is returned (e.g. refresh, Telegram exchange).
 */
export interface AuthClientProfileResponseBody {
  readonly profile: AuthClientProfile;
}
