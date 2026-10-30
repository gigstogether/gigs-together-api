import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  getConfigBoolean,
  getConfigPositiveSafeInteger,
  getConfigString,
  getRequiredConfigString,
} from '../../shared/utils/env';

/** Default access JWT TTL: 3_600 s = 1 h = 60 min. */
const DEFAULT_ACCESS_EXPIRES_IN_SECONDS = 3_600;

/** Default refresh JWT TTL: 2_592_000 s = 30 d = 720 h. */
const DEFAULT_REFRESH_EXPIRES_IN_SECONDS = 2_592_000;

type AuthCookieSameSite = 'lax' | 'strict' | 'none';
type AuthCookieKind = 'access' | 'refresh';

export interface AuthCookieConfig {
  readonly name: string;
  readonly secure: boolean;
  readonly sameSite: AuthCookieSameSite;
  readonly domain?: string;
}

/** Immutable auth configuration snapshot shared by JWT and cookie consumers. */
export interface AuthConfig {
  readonly accessSecret: string;
  readonly accessExpiresInSeconds: number;
  readonly refreshSecret: string;
  readonly refreshExpiresInSeconds: number;
  readonly accessCookie: AuthCookieConfig;
  readonly refreshCookie: AuthCookieConfig;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

function resolveCookieSameSite(
  configService: ConfigService,
  variableName: string,
): AuthCookieSameSite {
  const value = getConfigString(configService, variableName)?.toLowerCase();
  if (value === undefined) {
    return 'lax';
  }
  if (value === 'lax' || value === 'strict' || value === 'none') {
    return value;
  }
  throw new Error(`${variableName} must be lax, strict, or none.`);
}

function createCookieConfig(
  configService: ConfigService,
  kind: AuthCookieKind,
  isProduction: boolean,
): AuthCookieConfig {
  const prefix = kind === 'access' ? 'ACCESS_TOKEN' : 'REFRESH_TOKEN';
  const defaultName = kind === 'access' ? 'gt_access' : 'gt_refresh';

  return {
    name:
      getConfigString(configService, `${prefix}_COOKIE_NAME`) ?? defaultName,
    secure:
      getConfigBoolean(configService, `${prefix}_COOKIE_SECURE`) ??
      isProduction,
    sameSite: resolveCookieSameSite(configService, `${prefix}_COOKIE_SAMESITE`),
    domain: getConfigString(configService, `${prefix}_COOKIE_DOMAIN`),
  };
}

export function createAuthConfig(configService: ConfigService): AuthConfig {
  const isProduction =
    getConfigString(configService, 'NODE_ENV')?.toLowerCase() === 'prod';

  return {
    accessSecret: getRequiredConfigString(configService, 'JWT_SECRET'),
    accessExpiresInSeconds:
      getConfigPositiveSafeInteger(
        configService,
        'JWT_ACCESS_EXPIRES_IN_SEC',
      ) ?? DEFAULT_ACCESS_EXPIRES_IN_SECONDS,
    refreshSecret: getRequiredConfigString(configService, 'JWT_REFRESH_SECRET'),
    refreshExpiresInSeconds:
      getConfigPositiveSafeInteger(
        configService,
        'JWT_REFRESH_EXPIRES_IN_SEC',
      ) ?? DEFAULT_REFRESH_EXPIRES_IN_SECONDS,
    accessCookie: createCookieConfig(configService, 'access', isProduction),
    refreshCookie: createCookieConfig(configService, 'refresh', isProduction),
  };
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: createAuthConfig,
    },
  ],
  exports: [AUTH_CONFIG],
})
export class AuthConfigModule {}
