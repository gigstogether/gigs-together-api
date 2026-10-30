import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { AccessTokenIdentityPayload } from './types/access-token-identity.types';
import { AUTH_CONFIG, createAuthConfig } from './auth-config.module';
import type { AuthConfig } from './auth-config.module';
import { AuthenticationService } from './authentication.service';
import { AuthorizationService } from './authorization.service';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';

const ADMIN_USER_ID = '66a000000000000000000001';
const SECOND_ADMIN_USER_ID = '66a000000000000000000002';
const NON_ADMIN_USER_ID = '66a000000000000000000009';

function createTestAuthConfig(adminCacheTtlMs = ''): AuthConfig {
  return createAuthConfig(
    new ConfigService({
      JWT_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_EXPIRES_IN_SEC: '',
      JWT_REFRESH_EXPIRES_IN_SEC: '',
      ADMIN_CACHE_TTL_MS: adminCacheTtlMs,
      ACCESS_TOKEN_COOKIE_NAME: '',
      ACCESS_TOKEN_COOKIE_SECURE: '',
      ACCESS_TOKEN_COOKIE_SAMESITE: '',
      ACCESS_TOKEN_COOKIE_DOMAIN: '',
      REFRESH_TOKEN_COOKIE_NAME: '',
      REFRESH_TOKEN_COOKIE_SECURE: '',
      REFRESH_TOKEN_COOKIE_SAMESITE: '',
      REFRESH_TOKEN_COOKIE_DOMAIN: '',
      NODE_ENV: 'dev',
    }),
  );
}

describe('AuthorizationService', () => {
  let service: AuthorizationService;
  let authenticationService: {
    authenticateAccessToken: ReturnType<typeof vi.fn>;
    authenticateRefreshToken: ReturnType<typeof vi.fn>;
  };
  const userService = {
    findActiveUserIdsByRole: vi
      .fn()
      .mockResolvedValue([ADMIN_USER_ID, SECOND_ADMIN_USER_ID]),
  };

  async function createService(
    authConfig = createTestAuthConfig(),
  ): Promise<AuthorizationService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        {
          provide: AuthenticationService,
          useValue: authenticationService,
        },
        {
          provide: AUTH_CONFIG,
          useValue: authConfig,
        },
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    }).compile();

    return module.get<AuthorizationService>(AuthorizationService);
  }

  beforeEach(async () => {
    authenticationService = {
      authenticateAccessToken: vi.fn(),
      authenticateRefreshToken: vi.fn(),
    };

    service = await createService();
    userService.findActiveUserIdsByRole.mockResolvedValue([
      ADMIN_USER_ID,
      SECOND_ADMIN_USER_ID,
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isAdmin', () => {
    it('loads admins from DB on first call', async () => {
      await service.isAdmin(ADMIN_USER_ID);
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledWith(
        UserRole.Admin,
      );
    });

    it('should return true if internal userId exists in the cache', async () => {
      await service.refreshAdminsCache();
      const result = await service.isAdmin(ADMIN_USER_ID);
      expect(result).toBe(true);
    });

    it('should return false if internal userId does not exist in the cache', async () => {
      await service.refreshAdminsCache();
      const result = await service.isAdmin(NON_ADMIN_USER_ID);
      expect(result).toBe(false);
    });

    it('should reject duplicate active Admin userIds from storage', async () => {
      userService.findActiveUserIdsByRole.mockResolvedValue([
        ADMIN_USER_ID,
        ADMIN_USER_ID,
      ]);

      await expect(service.isAdmin(ADMIN_USER_ID)).rejects.toThrow(
        'Active Admin userIds must be unique',
      );
    });
  });

  describe('cache TTL', () => {
    let dateNowSpy: ReturnType<typeof vi.spyOn>;
    let virtualNow: number;

    beforeEach(() => {
      virtualNow = 1_000_000;
      dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => virtualNow);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    it('does not reload within TTL', async () => {
      await service.isAdmin(ADMIN_USER_ID);
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledTimes(1);

      virtualNow += 3_600_000 - 1; // default TTL is 1 hour (3_600_000 ms)
      await service.isAdmin(ADMIN_USER_ID);
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledTimes(1);

      virtualNow += 1;
      await service.isAdmin(ADMIN_USER_ID);
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledTimes(2);
    });

    it('should reload after configured TTL elapses', async () => {
      const configuredService = await createService(createTestAuthConfig('25'));

      await configuredService.isAdmin(ADMIN_USER_ID);
      virtualNow += 24;
      await configuredService.isAdmin(ADMIN_USER_ID);
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledTimes(1);

      virtualNow += 1;
      await configuredService.isAdmin(ADMIN_USER_ID);
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshAdminsCache', () => {
    it('reloads from DB even when TTL has not elapsed', async () => {
      await service.isAdmin(ADMIN_USER_ID);
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledTimes(1);
      await service.refreshAdminsCache();
      expect(userService.findActiveUserIdsByRole).toHaveBeenCalledTimes(2);
    });
  });

  describe('verifyAccessToken', () => {
    const identity: AccessTokenIdentityPayload = {
      kind: 'telegram',
      userId: ADMIN_USER_ID,
      telegramUserId: 123,
      snapshot: { firstName: 'Ada', isBot: false },
    };

    it('should authenticate then authorize access token by internal userId', async () => {
      authenticationService.authenticateAccessToken.mockResolvedValue(identity);
      await service.refreshAdminsCache();
      const result = await service.verifyAccessToken('jwt');
      expect(
        authenticationService.authenticateAccessToken,
      ).toHaveBeenCalledWith('jwt');
      expect(result).toEqual({
        identity,
        userId: ADMIN_USER_ID,
        isAdmin: true,
      });
    });

    it('should use internal userId from a current access token', async () => {
      const currentIdentity = {
        ...identity,
        userId: NON_ADMIN_USER_ID,
      };
      authenticationService.authenticateAccessToken.mockResolvedValue(
        currentIdentity,
      );

      const result = await service.verifyAccessToken('jwt');

      expect(result).toMatchObject({
        userId: NON_ADMIN_USER_ID,
        isAdmin: false,
      });
    });

    it('should reject bot telegram snapshot', async () => {
      authenticationService.authenticateAccessToken.mockResolvedValue({
        ...identity,
        snapshot: { firstName: 'Bot', isBot: true },
      });
      await expect(service.verifyAccessToken('jwt')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should reject unsupported identity kind', async () => {
      authenticationService.authenticateAccessToken.mockResolvedValue({
        kind: 'oauth',
      } as unknown as AccessTokenIdentityPayload);
      await expect(service.verifyAccessToken('jwt')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('verifyRefreshToken', () => {
    const identity: AccessTokenIdentityPayload = {
      kind: 'telegram',
      userId: NON_ADMIN_USER_ID,
      telegramUserId: 999,
      snapshot: { firstName: 'Ryu', isBot: false },
    };

    it('should authenticate then authorize refresh token', async () => {
      authenticationService.authenticateRefreshToken.mockResolvedValue(
        identity,
      );
      await service.refreshAdminsCache();
      const result = await service.verifyRefreshToken('jwt');
      expect(
        authenticationService.authenticateRefreshToken,
      ).toHaveBeenCalledWith('jwt');
      expect(result).toEqual({
        identity,
        userId: NON_ADMIN_USER_ID,
        isAdmin: false,
      });
    });

    it('should reject bot telegram snapshot', async () => {
      authenticationService.authenticateRefreshToken.mockResolvedValue({
        ...identity,
        snapshot: { firstName: 'Bot', isBot: true },
      });
      await expect(service.verifyRefreshToken('jwt')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should reject unsupported identity kind', async () => {
      authenticationService.authenticateRefreshToken.mockResolvedValue({
        kind: 'oauth',
      } as unknown as AccessTokenIdentityPayload);
      await expect(service.verifyRefreshToken('jwt')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
