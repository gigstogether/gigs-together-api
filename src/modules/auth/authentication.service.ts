import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import type {
  AccessTokenIdentityPayload,
  AccessTokenPayload,
} from './types/access-token-identity.types';
import { isRecord } from '@shared/utils/is-record';
import { AUTH_CONFIG } from './auth-config.module';
import type { AuthConfig } from './auth-config.module';

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
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  domain?: string;
}

type CookieKind = 'access' | 'refresh';

/**
 * Access + refresh JWT signing/verification and HttpOnly auth cookies.
 */
@Injectable()
export class AuthenticationService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  getAccessExpiresInSeconds(): number {
    return this.authConfig.accessExpiresInSeconds;
  }

  getRefreshExpiresInSeconds(): number {
    return this.authConfig.refreshExpiresInSeconds;
  }

  async signAccessToken(identity: AccessTokenIdentityPayload): Promise<string> {
    const sub = this.subjectFromAccessIdentity(identity);
    const payload: AccessTokenPayload = { sub, typ: 'access', identity };
    const expiresIn = this.getAccessExpiresInSeconds();
    return this.jwtService.signAsync(payload, {
      secret: this.authConfig.accessSecret,
      expiresIn,
      algorithm: 'HS256',
    });
  }

  async authenticateAccessToken(
    token: string,
  ): Promise<AccessTokenIdentityPayload> {
    let payload: AccessTokenPayloadShape;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayloadShape>(
        token,
        {
          secret: this.authConfig.accessSecret,
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
    const expiresIn = this.getRefreshExpiresInSeconds();
    return this.jwtService.signAsync(payload, {
      secret: this.authConfig.refreshSecret,
      expiresIn,
      algorithm: 'HS256',
    });
  }

  async authenticateRefreshToken(
    token: string,
  ): Promise<AccessTokenIdentityPayload> {
    let payload: AccessTokenPayloadShape;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayloadShape>(
        token,
        {
          secret: this.authConfig.refreshSecret,
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
    return this.authConfig.accessCookie.name;
  }

  getRefreshCookieName(): string {
    return this.authConfig.refreshCookie.name;
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
    const cookieConfig =
      kind === 'access'
        ? this.authConfig.accessCookie
        : this.authConfig.refreshCookie;
    const options: AuthCookieSharedOptions = {
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: '/',
    };
    if (cookieConfig.domain !== undefined) {
      options.domain = cookieConfig.domain;
    }
    return options;
  }
}
