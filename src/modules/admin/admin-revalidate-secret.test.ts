import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { assertAdminRevalidateSecret } from './admin-revalidate-secret';

describe('assertAdminRevalidateSecret', () => {
  const configService = {
    get: vi.fn(),
  } satisfies Pick<ConfigService, 'get'>;

  beforeEach(() => {
    configService.get.mockReset();
  });

  it('should pass when header secret matches configured value', () => {
    configService.get.mockReturnValue('secret');

    expect(() =>
      assertAdminRevalidateSecret(
        configService as unknown as ConfigService,
        'secret',
      ),
    ).not.toThrow();
  });

  it('should throw UnauthorizedException when secret header is missing', () => {
    configService.get.mockReturnValue('secret');

    expect(() =>
      assertAdminRevalidateSecret(
        configService as unknown as ConfigService,
        undefined,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('should throw ServiceUnavailableException when secret is not configured', () => {
    configService.get.mockReturnValue('');

    expect(() =>
      assertAdminRevalidateSecret(
        configService as unknown as ConfigService,
        'secret',
      ),
    ).toThrow(ServiceUnavailableException);
  });
});
