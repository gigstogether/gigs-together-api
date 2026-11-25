import { Inject, Injectable } from '@nestjs/common';

import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import type { AiGigLookupParams, AiGigLookupResult } from './ai-lookup.types';
import { AI_GIG_LOOKUP_PROVIDER } from './providers/ai-gig-lookup.provider';
import type { AiGigLookupProvider } from './providers/ai-gig-lookup.provider';

/** Stable facade used by application modules regardless of AI provider. */
@Injectable()
export class AiService {
  constructor(
    private readonly aiLookupDevStubService: AiLookupDevStubService,
    @Inject(AI_GIG_LOOKUP_PROVIDER)
    private readonly gigLookupProvider: AiGigLookupProvider,
  ) {}

  lookupGig(params: AiGigLookupParams): Promise<AiGigLookupResult | null> {
    const stubGig = this.aiLookupDevStubService.getStubGig(params);
    if (stubGig) {
      return Promise.resolve(stubGig);
    }

    return this.gigLookupProvider.lookupGig(params);
  }
}
