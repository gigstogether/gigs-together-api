import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import type { AccessTokenIdentityPayload } from './types/access-token-identity.types';
import { AuthenticationService } from './authentication.service';

const ACCESS_SECRET = 'test-access-secret-at-least-32-chars!!';
const REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';

function mockConfig(map: Record<string, string>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as ConfigService;
}

function telegramIdentity(
  overrides: Partial<AccessTokenIdentityPayload> = {},
): AccessTokenIdentityPayload {
  return {
    kind: 'telegram',
    telegramUserId: 4242,
    snapshot: { firstName: 'Ada', isBot: false },
    ...overrides,
  };
}

function refreshTelegramIdentity(): AccessTokenIdentityPayload {
  return {
    kind: 'telegram',
    telegramUserId: 9001,
    snapshot: { firstName: 'Ryu', isBot: false },
  };
}

describe('AuthenticationService', () => {
  let jwtService: JwtService;
  let config: ConfigService;
  let sut: AuthenticationService;

  beforeEach(() => {
    config = mockConfig({
      JWT_SECRET: ACCESS_SECRET,
      JWT_ACCESS_EXPIRES_IN_SEC: '3600',
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      JWT_REFRESH_EXPIRES_IN_SEC: '86400',
    });
    jwtService = new JwtService({
      secret: ACCESS_SECRET,
      signOptions: { expiresIn: 3_600, algorithm: 'HS256' },
    });
    sut = new AuthenticationService(jwtService, config);
  });

  describe('JWT expires', () => {
    it('should return default access TTL when unset', () => {
      const service = new AuthenticationService(
        jwtService,
        mockConfig({ JWT_SECRET: ACCESS_SECRET }),
      );
      expect(service.getAccessExpiresInSeconds()).toBe(3_600);
      expect(
        AuthenticationService.resolveAccessExpiresInSeconds(mockConfig({})),
      ).toBe(3_600);
    });

    it('should parse positive access TTL from env', () => {
      expect(
        AuthenticationService.resolveAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: '7200' }),
        ),
      ).toBe(7_200);
    });

    it('should floor non-integer access TTL strings', () => {
      expect(
        AuthenticationService.resolveAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: '90.7' }),
        ),
      ).toBe(90);
    });

    it('should fall back when access TTL is zero or invalid', () => {
      expect(
        AuthenticationService.resolveAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: '0' }),
        ),
      ).toBe(3_600);
      expect(
        AuthenticationService.resolveAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: 'nope' }),
        ),
      ).toBe(3_600);
    });

    it('should return default refresh TTL when unset', () => {
      expect(
        AuthenticationService.resolveRefreshExpiresInSeconds(mockConfig({})),
      ).toBe(2_592_000);
    });

    it('should parse positive refresh TTL from env', () => {
      expect(
        AuthenticationService.resolveRefreshExpiresInSeconds(
          mockConfig({ JWT_REFRESH_EXPIRES_IN_SEC: '86400' }),
        ),
      ).toBe(86_400);
    });
  });

  describe('access JWT', () => {
    it('should return configured access TTL from getAccessExpiresInSeconds', () => {
      expect(sut.getAccessExpiresInSeconds()).toBe(3_600);
    });

    it('signAccessToken then authenticateAccessToken returns identity', async () => {
      const identity = telegramIdentity();
      const token = await sut.signAccessToken(identity);
      const authenticated = await sut.authenticateAccessToken(token);
      expect(authenticated).toEqual(identity);
    });

    it('throws when JWT_SECRET is missing on sign', () => {
      const badConfig = mockConfig({
        JWT_REFRESH_SECRET: REFRESH_SECRET,
      });
      const service = new AuthenticationService(jwtService, badConfig);
      return expect(
        service.signAccessToken(telegramIdentity()),
      ).rejects.toThrow('JWT_SECRET is required');
    });

    it('rejects token signed with a different secret', async () => {
      const otherSecret = 'other-access-secret-at-least-32-chars-x!!';
      const otherConfig = mockConfig({
        JWT_SECRET: otherSecret,
        JWT_ACCESS_EXPIRES_IN_SEC: '3600',
      });
      const otherJwt = new JwtService({
        secret: otherSecret,
        signOptions: { expiresIn: 3_600, algorithm: 'HS256' },
      });
      const otherSut = new AuthenticationService(otherJwt, otherConfig);
      const token = await otherSut.signAccessToken(telegramIdentity());
      return expect(sut.authenticateAccessToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects non-access typ', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockResolvedValue({
          typ: 'refresh',
          sub: 'telegram:4242',
          identity: telegramIdentity(),
        }),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateAccessToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects tampered subject', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockResolvedValue({
          typ: 'access',
          sub: 'telegram:99999',
          identity: telegramIdentity(),
        }),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateAccessToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when identity is missing or not an object', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockResolvedValue({
          typ: 'access',
          sub: 'telegram:1',
          identity: null,
        }),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateAccessToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects unsupported identity kind in subject derivation', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockResolvedValue({
          typ: 'access',
          sub: 'x',
          identity: { kind: 'oauth' },
        }),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateAccessToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when verifyAsync fails', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockRejectedValue(new Error('bad sig')),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateAccessToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh JWT', () => {
    beforeEach(() => {
      jwtService = new JwtService({
        secret: REFRESH_SECRET,
        signOptions: { expiresIn: 86_400, algorithm: 'HS256' },
      });
      sut = new AuthenticationService(jwtService, config);
    });

    it('should return configured refresh TTL from getRefreshExpiresInSeconds', () => {
      expect(sut.getRefreshExpiresInSeconds()).toBe(86_400);
    });

    it('signRefreshToken then authenticateRefreshToken returns identity', async () => {
      const identity = refreshTelegramIdentity();
      const token = await sut.signRefreshToken(identity);
      const out = await sut.authenticateRefreshToken(token);
      expect(out).toEqual(identity);
    });

    it('throws when JWT_REFRESH_SECRET is missing on sign', () => {
      const badConfig = mockConfig({
        JWT_SECRET: ACCESS_SECRET,
      });
      const service = new AuthenticationService(jwtService, badConfig);
      return expect(
        service.signRefreshToken(refreshTelegramIdentity()),
      ).rejects.toThrow('JWT_REFRESH_SECRET is required');
    });

    it('rejects refresh-shaped token signed with a non-refresh secret', async () => {
      const wrongSecret = 'wrong-signing-secret-not-jwt-refresh-32chars!!';
      const wrongSigner = new JwtService({
        secret: wrongSecret,
        signOptions: { expiresIn: 86_400, algorithm: 'HS256' },
      });
      const identity = refreshTelegramIdentity();
      const sub = 'telegram:9001';
      const token = await wrongSigner.signAsync(
        { typ: 'refresh', sub, identity },
        {
          secret: wrongSecret,
          expiresIn: 86_400,
          algorithm: 'HS256',
        },
      );
      return expect(sut.authenticateRefreshToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects non-refresh typ', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockResolvedValue({
          typ: 'access',
          sub: 'telegram:9001',
          identity: refreshTelegramIdentity(),
        }),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateRefreshToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects tampered subject', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockResolvedValue({
          typ: 'refresh',
          sub: 'telegram:1',
          identity: refreshTelegramIdentity(),
        }),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateRefreshToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects unsupported refresh identity kind', () => {
      const mockJwt = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn().mockResolvedValue({
          typ: 'refresh',
          sub: 'x',
          identity: { kind: 'oauth' },
        }),
      } as unknown as JwtService;
      const service = new AuthenticationService(mockJwt, config);
      return expect(
        service.authenticateRefreshToken('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('auth cookies', () => {
    beforeEach(() => {
      sut = new AuthenticationService(jwtService, mockConfig({}));
    });

    it('defaults access cookie name to gt_access', () => {
      expect(sut.getAccessCookieName()).toBe('gt_access');
    });

    it('defaults refresh cookie name to gt_refresh', () => {
      expect(sut.getRefreshCookieName()).toBe('gt_refresh');
    });

    it('uses trimmed custom cookie names from env', () => {
      const service = new AuthenticationService(
        jwtService,
        mockConfig({
          ACCESS_TOKEN_COOKIE_NAME: '  my_access  ',
          REFRESH_TOKEN_COOKIE_NAME: 'my_refresh',
        }),
      );
      expect(service.getAccessCookieName()).toBe('my_access');
      expect(service.getRefreshCookieName()).toBe('my_refresh');
    });

    it('setAccessTokenCookie sets maxAge from expiresInSec (seconds → ms)', () => {
      const service = new AuthenticationService(
        jwtService,
        mockConfig({ NODE_ENV: 'dev' }),
      );
      const res = { cookie: vi.fn() } as unknown as Response;
      service.setAccessTokenCookie(res, 'tok', 120);
      expect(res.cookie).toHaveBeenCalledWith(
        'gt_access',
        'tok',
        expect.objectContaining({
          httpOnly: true,
          maxAge: 120_000,
          path: '/',
        }),
      );
    });

    it('clearAccessTokenCookie clears with maxAge 0', () => {
      const res = { cookie: vi.fn() } as unknown as Response;
      sut.clearAccessTokenCookie(res);
      expect(res.cookie).toHaveBeenCalledWith(
        'gt_access',
        '',
        expect.objectContaining({ maxAge: 0, httpOnly: true }),
      );
    });

    it('clearAllAuthCookies clears both cookies', () => {
      const res = { cookie: vi.fn() } as unknown as Response;
      sut.clearAllAuthCookies(res);
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });
  });
});
