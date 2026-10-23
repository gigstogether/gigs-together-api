import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jwtVerify } from 'jose';
import { TelegramOidcAuthService } from './telegram-oidc-auth.service';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn(),
}));

describe('TelegramOidcAuthService', () => {
  const configServiceMock = { get: vi.fn(() => '123456') };
  let service: TelegramOidcAuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramOidcAuthService,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    service = moduleRef.get(TelegramOidcAuthService);
  });

  it('should reject construction when client ID is missing', () => {
    expect(
      () =>
        new TelegramOidcAuthService(
          new ConfigService({ TELEGRAM_OIDC_CLIENT_ID: '' }),
        ),
    ).toThrowError('TELEGRAM_OIDC_CLIENT_ID is not configured.');
  });

  it('should reject construction when client ID is invalid', () => {
    expect(
      () =>
        new TelegramOidcAuthService(
          new ConfigService({ TELEGRAM_OIDC_CLIENT_ID: 'invalid' }),
        ),
    ).toThrowError('TELEGRAM_OIDC_CLIENT_ID must be a positive safe integer.');
  });

  it('should resolve a trusted Telegram user from a verified ID token', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: {
        id: '42',
        name: 'Arina',
        preferred_username: 'arina',
        picture: 'https://example.com/avatar.jpg',
      },
      protectedHeader: { alg: 'RS256' },
    });
    const result = await service.resolveUserFromIdToken('signed-token');

    expect(result).toEqual({
      tgUser: {
        id: 42,
        first_name: 'Arina',
        is_bot: false,
        username: 'arina',
        photo_url: 'https://example.com/avatar.jpg',
      },
    });
  });

  it('should reject an ID token with invalid claims', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { id: 'not-a-number', name: 'Arina' },
      protectedHeader: { alg: 'RS256' },
    });

    await expect(
      service.resolveUserFromIdToken('invalid-token'),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'Invalid Telegram ID token',
    });
  });
});
