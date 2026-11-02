import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertingModule } from '@modules/alerting/alerting.module';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramDigestDeliveryAdapter } from './adapters/telegram-digest-delivery.adapter';
import { DigestCronService } from './digest-cron.service';
import { DIGEST_DELIVERY } from './digest-delivery';
import {
  DigestPostState,
  DigestPostStateSchema,
} from './digest-post-state.schema';
import { DigestService } from './digest.service';
import { DIGEST_POST_STATE_REPOSITORY } from './repositories/digest-post-state.repository';
import { MongoDigestPostStateRepository } from './repositories/mongo-digest-post-state.repository';

/**
 * Digest notifications; scheduled Telegram posting on a fixed timezone (Europe/Madrid).
 */
@Module({
  imports: [
    AlertingModule,
    MongooseModule.forFeature([
      {
        name: DigestPostState.name,
        schema: DigestPostStateSchema,
      },
    ]),
    GigModule,
    TelegramModule,
  ],
  providers: [
    DigestService,
    DigestCronService,
    {
      provide: DIGEST_DELIVERY,
      useClass: TelegramDigestDeliveryAdapter,
    },
    {
      provide: DIGEST_POST_STATE_REPOSITORY,
      useClass: MongoDigestPostStateRepository,
    },
  ],
  exports: [DigestService],
})
export class DigestModule {}
