import { Module } from '@nestjs/common';
import { GigService } from './gig.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Gig, GigSchema } from './gig.schema';
import { GigController } from './gig.controller';
import { CalendarModule } from '../calendar/calendar.module';
import { BucketModule } from '../bucket/bucket.module';
import { GigPosterService } from './gig.poster.service';
import { FeedRevalidateService } from './feed-revalidate.service';
import { AuthModule } from '../auth/auth.module';
import { TelegramModule } from '../telegram/telegram.module';
import { GIG_REPOSITORY } from './repositories/gig.repository';
import { MongoGigRepository } from './repositories/mongo-gig.repository';
import { GigFeedService } from './gig-feed.service';
import { RemoteImageModule } from '../remote-image/remote-image.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Gig.name, schema: GigSchema }]),
    CalendarModule,
    BucketModule,
    RemoteImageModule,
    AuthModule,
    TelegramModule,
  ],
  providers: [
    {
      provide: GIG_REPOSITORY,
      useClass: MongoGigRepository,
    },
    GigService,
    GigFeedService,
    GigPosterService,
    FeedRevalidateService,
  ],
  exports: [
    MongooseModule,
    GigService,
    GigFeedService,
    FeedRevalidateService,
    GigPosterService,
  ],
  controllers: [GigController],
})
export class GigModule {}
