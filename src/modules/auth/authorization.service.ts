import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from './schemas/admin.schema';
import type {
  AccessTokenIdentityPayload,
  VerifiedAccessToken,
} from './types/access-token-identity.types';
import { AuthenticationService } from './authentication.service';

/**
 * Admin list from MongoDB (cached). Used for JWT `isAdmin` and webhook checks.
 * Cache is revalidated on a TTL (ADMIN_CACHE_TTL_MS, default 3_600_000 ms = 1 hour).
 */
@Injectable()
export class AuthorizationService {
  private adminsCache: AdminDocument[] | undefined;
  private cacheLoadedAtMs = 0;
  private loadInFlight: Promise<void> | undefined;
  private readonly cacheTtlMs: number;
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
    private readonly authenticationService: AuthenticationService,
    private readonly configService: ConfigService,
  ) {
    const raw = this.configService.get<string>('ADMIN_CACHE_TTL_MS');
    const parsed = raw?.trim() ? Number.parseInt(raw.trim(), 10) : Number.NaN;
    // Default 3_600_000 ms (1 hour). Override ADMIN_CACHE_TTL_MS for shorter windows in dev.
    this.cacheTtlMs =
      Number.isFinite(parsed) && parsed > 0 ? parsed : 3_600_000;
  }

  private async pullAdmins(): Promise<void> {
    const admins = await this.adminModel.find({ isActive: true }).exec();
    this.adminsCache = admins;
    this.cacheLoadedAtMs = Date.now();
    this.logger.log(`Admins cache refreshed: ${admins.length} admin(s) found.`);
  }

  /**
   * Forces a DB reload (used by TTL refresh and POST /v1/admin/revalidate/admins).
   */
  async refreshAdminsCache(): Promise<void> {
    await this.pullAdmins();
  }

  private needsRefresh(): boolean {
    if (this.adminsCache === undefined) {
      return true;
    }
    return Date.now() - this.cacheLoadedAtMs >= this.cacheTtlMs;
  }

  private async ensureFreshCache(): Promise<void> {
    while (this.needsRefresh()) {
      if (this.loadInFlight) {
        await this.loadInFlight;
        continue;
      }
      this.loadInFlight = this.pullAdmins().finally(() => {
        this.loadInFlight = undefined;
      });
      await this.loadInFlight;
    }
  }

  async isAdmin(telegramId: number): Promise<boolean> {
    await this.ensureFreshCache();
    const cache = this.adminsCache;
    if (!cache) {
      throw new Error('Admins cache is empty after refresh');
    }
    return cache.some((admin) => admin.telegramId === telegramId);
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    const identity =
      await this.authenticationService.authenticateAccessToken(token);
    return this.authorizeAccessIdentity(identity);
  }

  async verifyRefreshToken(token: string): Promise<VerifiedAccessToken> {
    const identity =
      await this.authenticationService.authenticateRefreshToken(token);
    return this.authorizeAccessIdentity(identity);
  }

  private async authorizeAccessIdentity(
    identity: AccessTokenIdentityPayload,
  ): Promise<VerifiedAccessToken> {
    switch (identity.kind) {
      case 'telegram': {
        if (identity.snapshot.isBot === true) {
          throw new ForbiddenException('Bots are not allowed');
        }
        const isAdmin = await this.isAdmin(identity.telegramUserId);
        return { identity, isAdmin };
      }
      default:
        throw new UnauthorizedException('Unsupported access token identity');
    }
  }
}
