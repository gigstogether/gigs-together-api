import { Module } from '@nestjs/common';
import { ReceiverController } from './receiver.controller';
import { ReceiverService } from './receiver.service';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { ConsoleLogger } from '@nestjs/common';
import { ReceiverWebhookGuard } from './guards/receiver-webhook.guard';
import { ReceiverWebhookExceptionFilter } from './filters/receiver-webhook-exception.filter';
import { GigBodyPipe } from './pipes/gig-body.pipe';
import { UserModule } from '../user/user.module';

@Module({
  imports: [GigModule, TelegramModule, AuthModule, UserModule],
  controllers: [ReceiverController],
  providers: [
    ReceiverService,
    ReceiverWebhookGuard,
    ReceiverExceptionFilter,
    ReceiverWebhookExceptionFilter,
    GigBodyPipe,
    ConsoleLogger,
  ],
  exports: [ReceiverService],
})
export class ReceiverModule {}
