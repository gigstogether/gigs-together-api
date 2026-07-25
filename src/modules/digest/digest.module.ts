import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DigestCronService } from './digest-cron.service';
import {
  DigestPublicationState,
  DigestPublicationStateSchema,
} from './digest-publication-state.schema';
import { DigestService } from './digest.service';

/**
 * Digest notifications; scheduled Telegram publish on a fixed timezone (Europe/Madrid).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DigestPublicationState.name,
        schema: DigestPublicationStateSchema,
      },
    ]),
    GigModule,
    TelegramModule,
  ],
  providers: [DigestService, DigestCronService],
  exports: [DigestService],
})
export class DigestModule {}
