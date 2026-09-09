import { Module } from '@nestjs/common';
import { GigService } from './gig.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Gig, GigSchema } from './gig.schema';
import { GigController } from './gig.controller';
import { CalendarModule } from '../calendar/calendar.module';
import { BucketModule } from '../bucket/bucket.module';
import { HttpModule } from '@nestjs/axios';
import { GigPosterService } from './gig.poster.service';
import { GigModerationService } from './gig-moderation.service';
import { FeedRevalidateService } from './feed-revalidate.service';
import { AuthModule } from '../auth/auth.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Gig.name, schema: GigSchema }]),
    CalendarModule,
    BucketModule,
    HttpModule,
    AuthModule,
    TelegramModule,
  ],
  providers: [
    GigService,
    GigPosterService,
    GigModerationService,
    FeedRevalidateService,
  ],
  exports: [
    MongooseModule,
    GigService,
    GigModerationService,
    FeedRevalidateService,
    GigPosterService,
  ],
  controllers: [GigController],
})
export class GigModule {}
