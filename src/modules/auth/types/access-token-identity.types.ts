/**
 * Identity carried inside access/refresh JWTs (`identity` claim). Extend the union when adding
 * non-Telegram login flows.
 */
export type AccessTokenIdentityPayload = TelegramAccessTokenIdentity;

export interface TelegramIdentitySnapshot {
  readonly firstName: string;
  readonly username?: string;
  readonly languageCode?: string;
  readonly isBot?: boolean;
  /** Additional Telegram user fields preserved for round-trip (optional). */
  readonly extra?: Record<string, unknown>;
}

export interface TelegramAccessTokenIdentity {
  readonly kind: 'telegram';
  readonly telegramUserId: number;
  readonly snapshot: TelegramIdentitySnapshot;
}

/**
 * Signed access JWT body: stable `sub` + extensible `identity`.
 */
export interface AccessTokenPayload {
  readonly sub: string;
  readonly typ: 'access';
  readonly identity: AccessTokenIdentityPayload;
}

/**
 * Result of verifying an access token (before mapping to the API user DTO).
 */
export interface VerifiedAccessToken {
  readonly identity: AccessTokenIdentityPayload;
  readonly isAdmin: boolean;
}
