import { Module } from '@nestjs/common';
import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import { AiService } from './ai.service';
import { AI_GIG_LOOKUP_PROVIDER } from './providers/ai-gig-lookup.provider';
import { OpenAiGigLookupProvider } from './providers/openai/openai-gig-lookup.provider';

@Module({
  providers: [
    AiService,
    AiLookupDevStubService,
    {
      provide: AI_GIG_LOOKUP_PROVIDER,
      useClass: OpenAiGigLookupProvider,
    },
  ],
  exports: [AiService],
})
export class AiModule {}
