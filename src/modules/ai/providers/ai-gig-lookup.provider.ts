import type { GigFormInput } from '../../gig/types/gig.types';
import type { AiGigLookupParams } from '../ai-lookup.types';

export const AI_GIG_LOOKUP_PROVIDER = Symbol('AI_GIG_LOOKUP_PROVIDER');

export interface AiGigLookupProvider {
  lookupGig(params: AiGigLookupParams): Promise<GigFormInput | null>;
}
