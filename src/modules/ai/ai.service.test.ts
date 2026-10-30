import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import { AiService } from './ai.service';

describe('AiService', () => {
  const resolveGigOrNull = vi.fn();

  async function createService(
    config: Record<string, unknown> = {},
  ): Promise<AiService> {
    const configService = new ConfigService({
      AI_API_KEY: '',
      AI_MODEL: '',
      AI_URL: '',
      AI_LOOKUP_DEBUG: '',
      ...config,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: configService },
        {
          provide: AiLookupDevStubService,
          useValue: { resolveGigOrNull },
        },
      ],
    }).compile();

    return module.get(AiService);
  }

  beforeEach(() => {
    resolveGigOrNull.mockReset();
    resolveGigOrNull.mockReturnValue(null);
  });

  it('should reject lookup when API key is not configured', async () => {
    const service = await createService();
    const lookup = service.lookupGigV1({ name: 'Band', location: 'Barcelona' });

    await expect(lookup).rejects.toThrow(InternalServerErrorException);
    await expect(lookup).rejects.toThrow('AI_API_KEY is not set on the server');
  });

  it('should reject lookup when model is not configured', async () => {
    const service = await createService({ AI_API_KEY: 'api-key' });

    await expect(
      service.lookupGigV1({ name: 'Band', location: 'Barcelona' }),
    ).rejects.toThrow('AI_MODEL is not set on the server');
  });

  it('should reject lookup when base URL is not configured', async () => {
    const service = await createService({
      AI_API_KEY: 'api-key',
      AI_MODEL: 'model',
    });

    await expect(
      service.lookupGigV1({ name: 'Band', location: 'Barcelona' }),
    ).rejects.toThrow('AI_URL is not set on the server');
  });

  it('should return dev stub result without requiring remote AI configuration', async () => {
    const stubGig = {
      title: 'Stub Gig',
      date: '2026-12-01T19:00:00.000Z',
      city: 'barcelona',
      country: 'ES',
      venue: 'Venue',
      ticketsUrl: 'https://tickets.example',
    };
    resolveGigOrNull.mockReturnValue(stubGig);
    const service = await createService();

    await expect(
      service.lookupGigV1({ name: 'Band', location: 'Barcelona' }),
    ).resolves.toEqual(stubGig);
  });

  it('should reject an invalid debug flag during initialization', async () => {
    await expect(
      createService({ AI_LOOKUP_DEBUG: 'sometimes' }),
    ).rejects.toThrow('AI_LOOKUP_DEBUG must be a boolean.');
  });
});
