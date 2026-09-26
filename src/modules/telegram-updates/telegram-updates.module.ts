import { Module } from '@nestjs/common';
import { TelegramUpdatesController } from './telegram-updates.controller';
import { TelegramUpdatesService } from './telegram-updates.service';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { GigCandidateModule } from '../gig-candidate/gig-candidate.module';
import { TelegramUpdatesExceptionFilter } from './filters/telegram-updates-exception.filter';
import { ConsoleLogger } from '@nestjs/common';
import { TelegramWebhookGuard } from './guards/telegram-webhook.guard';
import { TelegramWebhookExceptionFilter } from './filters/telegram-webhook-exception.filter';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    GigModule,
    TelegramModule,
    AuthModule,
    GigCandidateModule,
    UserModule,
  ],
  controllers: [TelegramUpdatesController],
  providers: [
    TelegramUpdatesService,
    TelegramWebhookGuard,
    TelegramUpdatesExceptionFilter,
    TelegramWebhookExceptionFilter,
    ConsoleLogger,
  ],
})
export class TelegramUpdatesModule {}
