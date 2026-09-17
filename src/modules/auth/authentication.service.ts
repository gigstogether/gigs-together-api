import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type {
  AccessTokenIdentityPayload,
  AccessTokenPayload,
} from './types/access-token-identity.types';
import { isRecord } from '../../shared/utils/is-record';

/** Payload shape returned by `verifyAsync` before narrowing to {@link AccessTokenPayload}. */
interface AccessTokenPayloadShape {
  readonly typ?: string;
  readonly sub?: string;
  readonly identity?: unknown;
}

interface RefreshTokenJwtPayload {
  readonly sub: string;
  readonly typ: 'refresh';
  readonly identity: AccessTokenIdentityPayload;
}

interface ParsedTelegramIdentitySnapshot {
  firstName: string;
  username?: string;
  languageCode?: string;
  isBot?: boolean;
  extra?: Record<string, unknown>;
}

/** Shared Express `res.cookie` options except `maxAge` / value. */
interface AuthCookieSharedOptions {
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'strict' | 'none';
  readonly path: string;
  readonly domain?: string;
}

type CookieKind = 'access' | 'refresh';

/**
 * Access + refresh JWT signing/verification and HttpOnly auth cookies.
 */
@Injectable()
export class AuthenticationService {
  /** Default access JWT TTL: 3_600 s = 1 h = 60 min. */
  private static readonly DEFAULT_ACCESS_EXPIRES_IN_SEC = 3_600;

  /** Default refresh JWT TTL: 2_592_000 s = 30 d = 720 h. */
  private static readonly DEFAULT_REFRESH_EXPIRES_IN_SEC = 2_592_000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  static resolveAccessExpiresInSeconds(config: ConfigService): number {
    return AuthenticationService.resolveExpiresInSeconds(
      config,
      'JWT_ACCESS_EXPIRES_IN_SEC',
      AuthenticationService.DEFAULT_ACCESS_EXPIRES_IN_SEC,
    );
  }

  static resolveRefreshExpiresInSeconds(config: ConfigService): number {
    return AuthenticationService.resolveExpiresInSeconds(
      config,
      'JWT_REFRESH_EXPIRES_IN_SEC',
      AuthenticationService.DEFAULT_REFRESH_EXPIRES_IN_SEC,
    );
  }

  getAccessExpiresInSeconds(): number {
    return AuthenticationService.resolveAccessExpiresInSeconds(
      this.configService,
    );
  }

  getRefreshExpiresInSeconds(): number {
    return AuthenticationService.resolveRefreshExpiresInSeconds(
      this.configService,
    );
  }

  async signAccessToken(identity: AccessTokenIdentityPayload): Promise<string> {
    const secret = this.requireAccessSecret();
    const sub = this.subjectFromAccessIdentity(identity);
    const payload: AccessTokenPayload = { sub, typ: 'access', identity };
    const expiresIn = this.getAccessExpiresInSeconds();
    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
      algorithm: 'HS256',
    });
  }

  async authenticateAccessToken(
    token: string,
  ): Promise<AccessTokenIdentityPayload> {
    const secret = this.requireAccessSecret();
    let payload: AccessTokenPayloadShape;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayloadShape>(
        token,
        {
          secret,
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Expected access token');
    }

    const identity = this.parseAccessTokenIdentity(payload.identity, 'access');
    const expectedSub = this.subjectFromAccessIdentity(identity);
    if (payload.sub !== expectedSub) {
      throw new UnauthorizedException('Invalid access token subject');
    }

    return identity;
  }

  async signRefreshToken(
    identity: AccessTokenIdentityPayload,
  ): Promise<string> {
    const sub = this.subjectFromAccessIdentity(identity);
    const payload: RefreshTokenJwtPayload = { sub, typ: 'refresh', identity };
    const secret = this.requireRefreshSecret();
    const expiresIn = this.getRefreshExpiresInSeconds();
    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
      algorithm: 'HS256',
    });
  }

  async authenticateRefreshToken(
    token: string,
  ): Promise<AccessTokenIdentityPayload> {
    const secret = this.requireRefreshSecret();
    let payload: AccessTokenPayloadShape;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayloadShape>(
        token,
        {
          secret,
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token type');
    }

    const identity = this.parseAccessTokenIdentity(payload.identity, 'refresh');
    const expectedSub = this.subjectFromAccessIdentity(identity);
    if (payload.sub !== expectedSub) {
      throw new UnauthorizedException('Invalid refresh token subject');
    }

    return identity;
  }

  getAccessCookieName(): string {
    const raw = this.configService.get<string>('ACCESS_TOKEN_COOKIE_NAME');
    return raw?.trim() || 'gt_access';
  }

  getRefreshCookieName(): string {
    const raw = this.configService.get<string>('REFRESH_TOKEN_COOKIE_NAME');
    return raw?.trim() || 'gt_refresh';
  }

  setAccessTokenCookie(
    res: Response,
    accessToken: string,
    expiresInSec: number,
  ): void {
    /* 1000 ms = 1 s — align cookie max-age with JWT TTL (`expiresInSec`). */
    const maxAgeMs = Math.max(0, Math.floor(expiresInSec)) * 1000;
    res.cookie(this.getAccessCookieName(), accessToken, {
      httpOnly: true,
      ...this.getSharedCookieOptions('access'),
      maxAge: maxAgeMs,
    });
  }

  setRefreshTokenCookie(
    res: Response,
    refreshToken: string,
    expiresInSec: number,
  ): void {
    const maxAgeMs = Math.max(0, Math.floor(expiresInSec)) * 1000;
    res.cookie(this.getRefreshCookieName(), refreshToken, {
      httpOnly: true,
      ...this.getSharedCookieOptions('refresh'),
      maxAge: maxAgeMs,
    });
  }

  clearAccessTokenCookie(res: Response): void {
    res.cookie(this.getAccessCookieName(), '', {
      httpOnly: true,
      ...this.getSharedCookieOptions('access'),
      maxAge: 0,
    });
  }

  clearRefreshTokenCookie(res: Response): void {
    res.cookie(this.getRefreshCookieName(), '', {
      httpOnly: true,
      ...this.getSharedCookieOptions('refresh'),
      maxAge: 0,
    });
  }

  clearAllAuthCookies(res: Response): void {
    this.clearAccessTokenCookie(res);
    this.clearRefreshTokenCookie(res);
  }

  private requireAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret?.trim()) {
      throw new Error('JWT_SECRET is required');
    }
    return secret.trim();
  }

  private static resolveExpiresInSeconds(
    config: ConfigService,
    envKey: string,
    defaultSeconds: number,
  ): number {
    const raw = config.get<string>(envKey);
    const n = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(n) && n > 0) {
      return Math.floor(n);
    }
    return defaultSeconds;
  }

  private requireRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret?.trim()) {
      throw new Error('JWT_REFRESH_SECRET is required');
    }
    return secret.trim();
  }

  private subjectFromAccessIdentity(
    identity: AccessTokenIdentityPayload,
  ): string {
    switch (identity.kind) {
      case 'telegram':
        return `telegram:${identity.telegramUserId}`;
      default:
        throw new UnauthorizedException('Unsupported access token identity');
    }
  }

  private parseAccessTokenIdentity(
    value: unknown,
    tokenKind: CookieKind,
  ): AccessTokenIdentityPayload {
    if (
      !isRecord(value) ||
      value.kind !== 'telegram' ||
      typeof value.userId !== 'string' ||
      value.userId.trim() === '' ||
      typeof value.telegramUserId !== 'number' ||
      !Number.isSafeInteger(value.telegramUserId) ||
      !isRecord(value.snapshot)
    ) {
      throw new UnauthorizedException(`Invalid ${tokenKind} token payload`);
    }

    const snapshot = value.snapshot;
    if (
      typeof snapshot.firstName !== 'string' ||
      snapshot.firstName.trim() === '' ||
      (snapshot.username !== undefined &&
        typeof snapshot.username !== 'string') ||
      (snapshot.languageCode !== undefined &&
        typeof snapshot.languageCode !== 'string') ||
      (snapshot.isBot !== undefined && typeof snapshot.isBot !== 'boolean') ||
      (snapshot.extra !== undefined && !isRecord(snapshot.extra))
    ) {
      throw new UnauthorizedException(`Invalid ${tokenKind} token payload`);
    }

    const parsedSnapshot: ParsedTelegramIdentitySnapshot = {
      firstName: snapshot.firstName,
    };
    if (snapshot.username !== undefined) {
      parsedSnapshot.username = snapshot.username;
    }
    if (snapshot.languageCode !== undefined) {
      parsedSnapshot.languageCode = snapshot.languageCode;
    }
    if (snapshot.isBot !== undefined) {
      parsedSnapshot.isBot = snapshot.isBot;
    }
    if (snapshot.extra !== undefined) {
      parsedSnapshot.extra = snapshot.extra;
    }

    return {
      kind: 'telegram',
      userId: value.userId.trim(),
      telegramUserId: value.telegramUserId,
      snapshot: parsedSnapshot,
    };
  }

  private getSharedCookieOptions(kind: CookieKind): AuthCookieSharedOptions {
    const secure = this.resolveCookieSecure(kind);
    const sameSite = this.resolveCookieSameSite(kind);
    const path = '/';
    const domain = this.resolveCookieDomain(kind);
    return {
      secure,
      sameSite,
      path,
      ...(domain ? { domain } : {}),
    };
  }

  private resolveCookieSecure(kind: CookieKind): boolean {
    const key =
      kind === 'refresh'
        ? 'REFRESH_TOKEN_COOKIE_SECURE'
        : 'ACCESS_TOKEN_COOKIE_SECURE';
    const raw = this.configService.get<string>(key);
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return (
      (this.configService.get<string>('NODE_ENV') ?? '').toLowerCase() ===
      'prod'
    );
  }

  private resolveCookieSameSite(kind: CookieKind): 'lax' | 'strict' | 'none' {
    const key =
      kind === 'refresh'
        ? 'REFRESH_TOKEN_COOKIE_SAMESITE'
        : 'ACCESS_TOKEN_COOKIE_SAMESITE';
    const raw = (this.configService.get<string>(key) ?? 'lax')
      .trim()
      .toLowerCase();
    if (raw === 'strict' || raw === 'none') {
      return raw;
    }
    return 'lax';
  }

  private resolveCookieDomain(kind: CookieKind): string | undefined {
    const key =
      kind === 'refresh'
        ? 'REFRESH_TOKEN_COOKIE_DOMAIN'
        : 'ACCESS_TOKEN_COOKIE_DOMAIN';
    const raw = this.configService.get<string>(key)?.trim();
    return raw || undefined;
  }
}
