import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthorizationService } from '../auth/authorization.service';
import type { TGUser } from './types/user.types';
import { isRecord } from '../../shared/utils/is-record';
import type { TelegramAuthenticationResult } from './types/telegram-auth.types';

const TELEGRAM_OIDC_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_OIDC_JWKS = createRemoteJWKSet(
  new URL('https://oauth.telegram.org/.well-known/jwks.json'),
);
const TELEGRAM_OIDC_ERROR_CONTEXT_KEYS = ['code', 'claim', 'reason'];

/** Verifies Telegram OIDC ID tokens and maps their trusted claims to the application user. */
@Injectable()
export class TelegramOidcAuthService {
  private readonly logger = new Logger(TelegramOidcAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async resolveUserFromIdToken(
    idToken: string,
  ): Promise<TelegramAuthenticationResult> {
    const clientId = this.requireClientId();
    const tgUser = await this.verifyIdToken(idToken, clientId);
    const isAdmin = await this.authorizationService.isAdmin(tgUser.id);
    return { tgUser, isAdmin };
  }

  private async verifyIdToken(
    idToken: string,
    clientId: string,
  ): Promise<TGUser> {
    try {
      const { payload } = await jwtVerify(idToken, TELEGRAM_OIDC_JWKS, {
        issuer: TELEGRAM_OIDC_ISSUER,
        audience: clientId,
        requiredClaims: ['id', 'name'],
      });
      return this.parseTelegramUser(payload);
    } catch (e) {
      this.logVerificationFailure('telegram_oidc_id_token_rejected', e);
      throw new ForbiddenException('Invalid Telegram ID token', { cause: e });
    }
  }

  private parseTelegramUser(payload: Record<string, unknown>): TGUser {
    const telegramUserId = this.parseTelegramUserId(payload.id);
    const name = payload.name;
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Telegram ID token has an invalid name claim');
    }

    const username = this.parseOptionalStringClaim(
      payload,
      'preferred_username',
    );
    const photoUrl = this.parseOptionalStringClaim(payload, 'picture');
    return {
      id: telegramUserId,
      first_name: name.trim(),
      is_bot: false,
      ...(username ? { username } : {}),
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    };
  }

  private parseTelegramUserId(value: unknown): number {
    const telegramUserId =
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (
      typeof telegramUserId !== 'number' ||
      !Number.isSafeInteger(telegramUserId) ||
      telegramUserId <= 0
    ) {
      throw new Error('Telegram ID token has an invalid id claim');
    }
    return telegramUserId;
  }

  private parseOptionalStringClaim(
    payload: Record<string, unknown>,
    claim: 'preferred_username' | 'picture',
  ): string | undefined {
    const value = payload[claim];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Telegram ID token has an invalid ${claim} claim`);
    }
    return value.trim();
  }

  private requireClientId(): string {
    const clientId = this.configService
      .get<string>('TELEGRAM_OIDC_CLIENT_ID')
      ?.trim();
    const numericClientId = Number(clientId);
    if (
      !clientId ||
      !Number.isSafeInteger(numericClientId) ||
      numericClientId <= 0
    ) {
      throw new Error('TELEGRAM_OIDC_CLIENT_ID must be a positive integer');
    }
    return clientId;
  }

  private logVerificationFailure(event: string, e: unknown): void {
    const context: Record<string, string> = { event };
    if (e instanceof Error) {
      context.errorName = e.name;
      context.message = e.message;
    }
    if (isRecord(e)) {
      for (const key of TELEGRAM_OIDC_ERROR_CONTEXT_KEYS) {
        const value = e[key];
        if (typeof value === 'string') {
          context[key] = value;
        }
      }
    }
    this.logger.warn(context);
  }
}
