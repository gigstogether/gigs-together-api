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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return a stub gig when the stub flag is enabled', () => {
    const service = createService({
      AI_LOOKUP_DEV_STUB: 'true',
      DEFAULT_GIG_POSTER_URL: ' https://cdn.example/default.jpg ',
    });

    expect(
      service.getStubGig({ name: 'Band', location: 'Barcelona' }),
    ).toMatchObject({
      title: '[DEV STUB] Band',
      ticketsUrl: 'https://example.com/dev-stub',
      posterUrl: 'https://cdn.example/default.jpg',
      locationHint: {
        locality: 'barcelona',
        country: 'ES',
        venue: 'Sala Razzmatazz (Barcelona)',
      },
    });
  });

  it.each(['production', 'prod', ' PRODUCTION ', ' PROD '])(
    'should not return a stub gig when NODE_ENV is %s and the flag is enabled',
    (nodeEnv) => {
      const service = createService({
        NODE_ENV: nodeEnv,
        AI_LOOKUP_DEV_STUB: 'true',
      });

      expect(
        service.getStubGig({ name: 'Band', location: 'Barcelona' }),
      ).toBeNull();
    },
  );

  it.each(['production', 'prod'])(
    'should not return a stub gig when NODE_ENV is %s and a keyword matches',
    (nodeEnv) => {
      const service = createService({
        NODE_ENV: nodeEnv,
        AI_LOOKUP_DEV_STUB_KEYWORD: 'band',
      });

      expect(
        service.getStubGig({ name: 'Band', location: 'Barcelona' }),
      ).toBeNull();
    },
  );

  it.each([undefined, '', '   ', 'dev', 'development', 'test'])(
    'should return a stub gig when NODE_ENV is %j and the flag is enabled',
    (nodeEnv) => {
      const service = createService({
        NODE_ENV: nodeEnv,
        AI_LOOKUP_DEV_STUB: 'true',
      });

      expect(
        service.getStubGig({ name: 'Band', location: 'Barcelona' }),
      ).toMatchObject({ title: '[DEV STUB] Band' });
    },
  );

  it('should not return a stub gig when neither flag nor keyword is configured', () => {
    const service = createService();

    expect(
      service.getStubGig({ name: 'Band', location: 'Barcelona' }),
    ).toBeNull();
  });

  it('should match a configured keyword case-insensitively', () => {
    const service = createService({
      AI_LOOKUP_DEV_STUB_KEYWORD: '  TEST GIG  ',
    });

    expect(
      service.getStubGig({
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
