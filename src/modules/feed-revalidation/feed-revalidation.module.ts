import { Module } from '@nestjs/common';
import { FeedRevalidationService } from './feed-revalidation.service';

@Module({
  providers: [FeedRevalidationService],
  exports: [FeedRevalidationService],
})
export class FeedRevalidationModule {}
