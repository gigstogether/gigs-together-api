import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import { AiService } from './ai.service';
import { AI_GIG_LOOKUP_PROVIDER } from './providers/ai-gig-lookup.provider';
import type { AiGigLookupProvider } from './providers/ai-gig-lookup.provider';

describe('AiService', () => {
  const resolveGigOrNull = vi.fn<AiLookupDevStubService['resolveGigOrNull']>();
  const lookupGig = vi.fn<AiGigLookupProvider['lookupGig']>();
  let service: AiService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resolveGigOrNull.mockReturnValue(null);
    lookupGig.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: AiLookupDevStubService,
          useValue: { resolveGigOrNull },
        },
        {
          provide: AI_GIG_LOOKUP_PROVIDER,
          useValue: { lookupGig },
        },
      ],
    }).compile();
    service = module.get(AiService);
  });

  it('should delegate a lookup to the configured provider', async () => {
    const params = { name: 'Band', location: 'Barcelona' };

    await service.lookupGig(params);

    expect(lookupGig).toHaveBeenCalledWith(params);
  });

  it('should return a dev stub without calling the configured provider', async () => {
    const stubGig = {
      title: 'Stub Gig',
      date: '2099-12-01T19:00:00.000Z',
      city: 'barcelona',
      country: 'ES',
      venue: 'Venue',
      ticketsUrl: 'https://tickets.example',
    };
    resolveGigOrNull.mockReturnValue(stubGig);

    await expect(
      service.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).resolves.toEqual(stubGig);
    expect(lookupGig).not.toHaveBeenCalled();
  });
});
