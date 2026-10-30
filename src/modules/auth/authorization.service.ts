import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AccessTokenIdentityPayload,
  VerifiedAccessToken,
} from './types/access-token-identity.types';
import { AuthenticationService } from './authentication.service';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { AUTH_CONFIG } from './auth-config.module';
import type { AuthConfig } from './auth-config.module';

/**
 * Admin list from MongoDB (cached). Used for JWT `isAdmin` and webhook checks.
 * Cache is revalidated on a TTL (ADMIN_CACHE_TTL_MS, default 3_600_000 ms = 1 hour).
 */
@Injectable()
export class AuthorizationService {
  private adminUserIdsCache: Set<string> | undefined;
  private cacheLoadedAtMs = 0;
  private loadInFlight: Promise<void> | undefined;
  private readonly cacheTtlMs: number;
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(
    private readonly authenticationService: AuthenticationService,
    @Inject(AUTH_CONFIG) authConfig: AuthConfig,
    private readonly userService: UserService,
  ) {
    this.cacheTtlMs = authConfig.adminCacheTtlMs;
  }

  private async pullAdmins(): Promise<void> {
    const adminUserIds = await this.userService.findActiveUserIdsByRole(
      UserRole.Admin,
    );
    const uniqueAdminUserIds = new Set(adminUserIds);
    if (uniqueAdminUserIds.size !== adminUserIds.length) {
      throw new Error('Active Admin userIds must be unique');
    }
    this.adminUserIdsCache = uniqueAdminUserIds;
    this.cacheLoadedAtMs = Date.now();
    this.logger.log(
      `Admins cache refreshed: ${adminUserIds.length} admin(s) found.`,
    );
  }

  /**
   * Forces a DB reload (used by TTL refresh).
   */
  async refreshAdminsCache(): Promise<void> {
    await this.pullAdmins();
  }

  private needsRefresh(): boolean {
    if (this.adminUserIdsCache === undefined) {
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

  async isAdmin(userId: string): Promise<boolean> {
    await this.ensureFreshCache();
    const cache = this.adminUserIdsCache;
    if (!cache) {
      throw new Error('Admins cache is empty after refresh');
    }
    return cache.has(userId);
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
        const isAdmin = await this.isAdmin(identity.userId);
        return {
          identity,
          userId: identity.userId,
          isAdmin,
        };
      }
      default:
        throw new UnauthorizedException('Unsupported access token identity');
    }
  }
}
