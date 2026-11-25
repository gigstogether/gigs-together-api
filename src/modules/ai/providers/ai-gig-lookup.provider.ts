import type { AiGigLookupParams, AiGigLookupResult } from '../ai-lookup.types';

export const AI_GIG_LOOKUP_PROVIDER = Symbol('AI_GIG_LOOKUP_PROVIDER');

export interface AiGigLookupProvider {
  lookupGig(params: AiGigLookupParams): Promise<AiGigLookupResult | null>;
}
