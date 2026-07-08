import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InternalApiKeyGuard } from './internal-api-key.guard';

function mockExecutionContext(
  headers: Record<string, string | string[]>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

function mockConfigService(apiKeyFromEnv: string | undefined) {
  return {
    get: (key: string) =>
      key === 'INTERNAL_API_KEY' ? apiKeyFromEnv : undefined,
  } satisfies Pick<ConfigService, 'get'>;
}

describe('InternalApiKeyGuard', () => {
  it('should throw ServiceUnavailableException when INTERNAL_API_KEY is not configured', () => {
    const guard = new InternalApiKeyGuard(
      mockConfigService(undefined) as unknown as ConfigService,
    );

    expect(() =>
      guard.canActivate(mockExecutionContext({ 'x-internal-api-key': 'any' })),
    ).toThrow(ServiceUnavailableException);
  });

  it('should throw UnauthorizedException when internal api key header is missing', () => {
    const guard = new InternalApiKeyGuard(
      mockConfigService('secret-token') as unknown as ConfigService,
    );

    expect(() => guard.canActivate(mockExecutionContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when internal api key header does not match', () => {
    const guard = new InternalApiKeyGuard(
      mockConfigService('secret-token') as unknown as ConfigService,
    );

    expect(() =>
      guard.canActivate(
        mockExecutionContext({ 'x-internal-api-key': 'wrong' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('should return true when trimmed internal api key header matches configured key', () => {
    const guard = new InternalApiKeyGuard(
      mockConfigService('secret-token') as unknown as ConfigService,
    );

    expect(
      guard.canActivate(
        mockExecutionContext({ 'x-internal-api-key': '  secret-token  ' }),
      ),
    ).toBe(true);
  });

  it('should accept first header value when internal api key is sent as duplicate headers', () => {
    const guard = new InternalApiKeyGuard(
      mockConfigService('secret-token') as unknown as ConfigService,
    );

    expect(
      guard.canActivate(
        mockExecutionContext({
          'x-internal-api-key': ['secret-token', 'ignored'],
        }),
      ),
    ).toBe(true);
  });
});
