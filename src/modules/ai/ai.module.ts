import { Module } from '@nestjs/common';
import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import { AiService } from './ai.service';
import { OpenAiGigLookupProvider } from './providers/openai/openai-gig-lookup.provider';

@Module({
  providers: [AiService, AiLookupDevStubService, OpenAiGigLookupProvider],
  exports: [AiService],
})
export class AiModule {}
