import { ConfigService } from '@nestjs/config';
import { createAuthConfig } from './auth-config.module';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

function createConfigService(
  overrides: Record<string, unknown> = {},
): ConfigService {
  return new ConfigService({
    JWT_SECRET: ACCESS_SECRET,
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    JWT_ACCESS_EXPIRES_IN_SEC: '',
    JWT_REFRESH_EXPIRES_IN_SEC: '',
    ADMIN_CACHE_TTL_MS: '',
    ACCESS_TOKEN_COOKIE_NAME: '',
    ACCESS_TOKEN_COOKIE_SECURE: '',
    ACCESS_TOKEN_COOKIE_SAMESITE: '',
    ACCESS_TOKEN_COOKIE_DOMAIN: '',
    REFRESH_TOKEN_COOKIE_NAME: '',
    REFRESH_TOKEN_COOKIE_SECURE: '',
    REFRESH_TOKEN_COOKIE_SAMESITE: '',
    REFRESH_TOKEN_COOKIE_DOMAIN: '',
    NODE_ENV: 'dev',
    ...overrides,
  });
}

describe('createAuthConfig', () => {
  it('should return normalized defaults when optional values are absent', () => {
    const config = createAuthConfig(
      createConfigService({
        JWT_SECRET: `  ${ACCESS_SECRET}  `,
        JWT_REFRESH_SECRET: `  ${REFRESH_SECRET}  `,
      }),
    );

    expect(config).toEqual({
      accessSecret: ACCESS_SECRET,
      accessExpiresInSeconds: 3_600,
      refreshSecret: REFRESH_SECRET,
      refreshExpiresInSeconds: 2_592_000,
      adminCacheTtlMs: 3_600_000,
      accessCookie: {
        name: 'gt_access',
        secure: false,
        sameSite: 'lax',
        domain: undefined,
      },
      refreshCookie: {
        name: 'gt_refresh',
        secure: false,
        sameSite: 'lax',
        domain: undefined,
      },
    });
  });

  it('should parse explicitly configured auth values', () => {
    const config = createAuthConfig(
      createConfigService({
        NODE_ENV: 'prod',
        JWT_ACCESS_EXPIRES_IN_SEC: '7200',
        JWT_REFRESH_EXPIRES_IN_SEC: '86400',
        ADMIN_CACHE_TTL_MS: '1800000',
        ACCESS_TOKEN_COOKIE_NAME: 'custom_access',
        ACCESS_TOKEN_COOKIE_SECURE: 'false',
        ACCESS_TOKEN_COOKIE_SAMESITE: 'strict',
        ACCESS_TOKEN_COOKIE_DOMAIN: 'example.com',
        REFRESH_TOKEN_COOKIE_NAME: 'custom_refresh',
        REFRESH_TOKEN_COOKIE_SECURE: 'true',
        REFRESH_TOKEN_COOKIE_SAMESITE: 'none',
        REFRESH_TOKEN_COOKIE_DOMAIN: 'auth.example.com',
      }),
    );

    expect(config).toMatchObject({
      accessExpiresInSeconds: 7_200,
      refreshExpiresInSeconds: 86_400,
      adminCacheTtlMs: 1_800_000,
      accessCookie: {
        name: 'custom_access',
        secure: false,
        sameSite: 'strict',
        domain: 'example.com',
      },
      refreshCookie: {
        name: 'custom_refresh',
        secure: true,
        sameSite: 'none',
        domain: 'auth.example.com',
      },
    });
  });

  it('should enable secure cookies by default in production', () => {
    const config = createAuthConfig(createConfigService({ NODE_ENV: 'prod' }));

    expect([config.accessCookie.secure, config.refreshCookie.secure]).toEqual([
      true,
      true,
    ]);
  });

  it.each([
    ['JWT_SECRET', 'JWT_SECRET is not configured.'],
    ['JWT_REFRESH_SECRET', 'JWT_REFRESH_SECRET is not configured.'],
  ])(
    'should throw when required value %s is blank',
    (variableName, message) => {
      expect(() =>
        createAuthConfig(createConfigService({ [variableName]: '   ' })),
      ).toThrow(message);
    },
  );

  it.each([
    ['JWT_ACCESS_EXPIRES_IN_SEC', '0'],
    ['JWT_REFRESH_EXPIRES_IN_SEC', '1.5'],
    ['ADMIN_CACHE_TTL_MS', 'invalid'],
  ])('should throw when integer value %s is invalid', (variableName, value) => {
    expect(() =>
      createAuthConfig(createConfigService({ [variableName]: value })),
    ).toThrow(`${variableName} must be a positive safe integer.`);
  });

  it('should throw when cookie secure value is invalid', () => {
    expect(() =>
      createAuthConfig(
        createConfigService({ ACCESS_TOKEN_COOKIE_SECURE: 'enabled' }),
      ),
    ).toThrow('ACCESS_TOKEN_COOKIE_SECURE must be a boolean.');
  });

  it('should throw when cookie SameSite value is invalid', () => {
    expect(() =>
      createAuthConfig(
        createConfigService({ REFRESH_TOKEN_COOKIE_SAMESITE: 'invalid' }),
      ),
    ).toThrow('REFRESH_TOKEN_COOKIE_SAMESITE must be lax, strict, or none.');
  });
});
