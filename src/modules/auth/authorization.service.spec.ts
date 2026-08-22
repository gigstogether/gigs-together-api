import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Admin } from './schemas/admin.schema';
import type { AccessTokenIdentityPayload } from './types/access-token-identity.types';
import { AuthenticationService } from './authentication.service';
import { AuthorizationService } from './authorization.service';
import { UserService } from '../user/user.service';

describe('AuthorizationService', () => {
  let service: AuthorizationService;
  let authenticationService: {
    authenticateAccessToken: ReturnType<typeof vi.fn>;
    authenticateRefreshToken: ReturnType<typeof vi.fn>;
  };
  const userService = {
    findOrCreateMessengerUser: vi
      .fn()
      .mockResolvedValue({ id: '66a000000000000000000001' }),
  };

  const mockAdmins = [
    { telegramId: 123, isActive: true },
    { telegramId: 456, isActive: true },
  ];

  const adminModelMock = {
    find: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockAdmins),
    }),
  };

  const configServiceMock = {
    get: vi.fn().mockReturnValue(undefined),
  };

  beforeEach(async () => {
    authenticationService = {
      authenticateAccessToken: vi.fn(),
      authenticateRefreshToken: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        {
          provide: AuthenticationService,
          useValue: authenticationService,
        },
        {
          provide: getModelToken(Admin.name),
          useValue: adminModelMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    }).compile();

    service = module.get<AuthorizationService>(AuthorizationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isAdmin', () => {
    it('loads admins from DB on first call', async () => {
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledWith({ isActive: true });
    });

    it('should return true if telegramId exists in the cache', async () => {
      await service.refreshAdminsCache();
      const result = await service.isAdmin(123);
      expect(result).toBe(true);
    });

    it('should return false if telegramId does not exist in the cache', async () => {
      await service.refreshAdminsCache();
      const result = await service.isAdmin(999);
      expect(result).toBe(false);
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
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(1);

      virtualNow += 3_600_000 - 1; // default TTL is 1 hour (3_600_000 ms)
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(1);

      virtualNow += 1;
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshAdminsCache', () => {
    it('reloads from DB even when TTL has not elapsed', async () => {
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(1);
      await service.refreshAdminsCache();
      expect(adminModelMock.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('verifyAccessToken', () => {
    const identity: AccessTokenIdentityPayload = {
      kind: 'telegram',
      telegramUserId: 123,
      snapshot: { firstName: 'Ada', isBot: false },
    };

    it('should authenticate then authorize access token', async () => {
      authenticationService.authenticateAccessToken.mockResolvedValue(identity);
      await service.refreshAdminsCache();
      const result = await service.verifyAccessToken('jwt');
      expect(
        authenticationService.authenticateAccessToken,
      ).toHaveBeenCalledWith('jwt');
      expect(result).toEqual({
        identity: { ...identity, userId: '66a000000000000000000001' },
        userId: '66a000000000000000000001',
        isAdmin: true,
      });
      expect(userService.findOrCreateMessengerUser).toHaveBeenCalledWith({
        messenger: 'Telegram',
        externalUserId: '123',
        username: undefined,
        displayName: 'Ada',
      });
    });

    it('should use internal userId from a current access token', async () => {
      const currentIdentity = {
        ...identity,
        userId: '66a000000000000000000000009',
      };
      authenticationService.authenticateAccessToken.mockResolvedValue(
        currentIdentity,
      );

      const result = await service.verifyAccessToken('jwt');

      expect(result.userId).toBe('66a000000000000000000000009');
      expect(userService.findOrCreateMessengerUser).not.toHaveBeenCalled();
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
        identity: { ...identity, userId: '66a000000000000000000001' },
        userId: '66a000000000000000000001',
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
