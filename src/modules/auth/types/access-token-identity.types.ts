/**
 * Identity carried inside access/refresh JWTs (`identity` claim). Extend the union when adding
 * non-Telegram login flows.
 */
export type AccessTokenIdentityPayload = TelegramAccessTokenIdentity;
export type ResolvedAccessTokenIdentityPayload =
  ResolvedTelegramAccessTokenIdentity;

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
  /**
   * Legacy access and refresh tokens issued before the User foundation do not contain this field.
   * Authorization resolves it once from the external identity, and token rotation persists it.
   */
  readonly userId?: string;
  readonly telegramUserId: number;
  readonly snapshot: TelegramIdentitySnapshot;
}

export interface ResolvedTelegramAccessTokenIdentity extends TelegramAccessTokenIdentity {
  readonly userId: string;
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
  readonly identity: ResolvedAccessTokenIdentityPayload;
  readonly userId: string;
  readonly isAdmin: boolean;
}
