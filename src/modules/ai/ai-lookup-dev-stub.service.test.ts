import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';

describe('AiLookupDevStubService', () => {
  function createService(
    config: Record<string, unknown> = {},
  ): AiLookupDevStubService {
    return new AiLookupDevStubService(
      new ConfigService({
        NODE_ENV: 'dev',
        AI_LOOKUP_DEV_STUB: '',
        AI_LOOKUP_DEV_STUB_KEYWORD: '',
        DEFAULT_GIG_POSTER_URL: '',
        ...config,
      }),
    );
  }

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a stub gig when the stub flag is enabled', () => {
    const service = createService({
      AI_LOOKUP_DEV_STUB: 'true',
      DEFAULT_GIG_POSTER_URL: ' https://cdn.example/default.jpg ',
    });

    expect(
      service.resolveGigOrNull({ name: 'Band', location: 'Barcelona' }),
    ).toMatchObject({
      title: '[DEV STUB] Band',
      city: 'barcelona',
      country: 'ES',
      venue: 'Sala Razzmatazz (Barcelona)',
      ticketsUrl: 'https://example.com/dev-stub',
      posterUrl: 'https://cdn.example/default.jpg',
    });
  });

  it('should not return a stub gig in production', () => {
    const service = createService({
      NODE_ENV: 'production',
      AI_LOOKUP_DEV_STUB: 'true',
    });

    expect(
      service.resolveGigOrNull({ name: 'Band', location: 'Barcelona' }),
    ).toBeNull();
  });

  it('should match a configured keyword case-insensitively', () => {
    const service = createService({
      AI_LOOKUP_DEV_STUB_KEYWORD: '  TEST GIG  ',
    });

    expect(
      service.resolveGigOrNull({
        name: 'A test gig',
        location: 'Barcelona',
      }),
    ).toMatchObject({ title: '[DEV STUB] A test gig' });
  });

  it('should reject an invalid stub flag during initialization', () => {
    expect(() => createService({ AI_LOOKUP_DEV_STUB: 'sometimes' })).toThrow(
      'AI_LOOKUP_DEV_STUB must be a boolean.',
    );
  });
});
