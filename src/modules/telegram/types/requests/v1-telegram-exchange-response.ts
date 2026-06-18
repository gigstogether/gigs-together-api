import type {
  AuthClientProfile,
  AuthClientProfileResponseBody,
} from '../../../auth/types/auth-client-profile.types';

/**
 * Same shape as {@link AuthClientProfile}; kept for Telegram route naming in API docs.
 */
export type V1TelegramClientProfile = AuthClientProfile;

/**
 * Result of signing access + refresh JWTs and building the public profile (cookies set by the controller).
 */
export interface V1TelegramAccessTokenExchangeResult {
  readonly accessToken: string;
  /** Access token lifetime in seconds. */
  readonly accessExpiresIn: number;
  readonly refreshToken: string;
  /** Refresh token lifetime in seconds. */
  readonly refreshExpiresIn: number;
  readonly profile: V1TelegramClientProfile;
}

/** JSON body for Telegram auth exchange endpoints (JWT is HttpOnly; only public profile here). */
export type V1TelegramExchangeResponseBody = AuthClientProfileResponseBody;
