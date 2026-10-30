import { Injectable } from '@nestjs/common';

import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import type { AiGigLookupParams } from './ai-lookup.types';
import { OpenAiGigLookupProvider } from './providers/openai/openai-gig-lookup.provider';
import type { GigFormInput } from '../gig/types/gig.types';

/** Stable facade used by application modules regardless of AI provider. */
@Injectable()
export class AiService {
  constructor(
    private readonly aiLookupDevStubService: AiLookupDevStubService,
    private readonly openAiGigLookupProvider: OpenAiGigLookupProvider,
  ) {}

  lookupGig(params: AiGigLookupParams): Promise<GigFormInput | null> {
    const stubGig = this.aiLookupDevStubService.resolveGigOrNull(params);
    if (stubGig) {
      return Promise.resolve(stubGig);
    }

    return this.openAiGigLookupProvider.lookupGig(params);
  }
}
