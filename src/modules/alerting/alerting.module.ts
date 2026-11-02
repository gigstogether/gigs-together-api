import { Module } from '@nestjs/common';
import { TelegramBotClientModule } from '../telegram/telegram-bot-client/telegram-bot-client.module';
import { ALERT_DELIVERY } from './alert-delivery';
import { AlertingService } from './alerting.service';
import { TelegramAlertDeliveryService } from './telegram-alert-delivery.service';

@Module({
  imports: [TelegramBotClientModule],
  providers: [
    AlertingService,
    TelegramAlertDeliveryService,
    {
      provide: ALERT_DELIVERY,
      useExisting: TelegramAlertDeliveryService,
    },
  ],
  exports: [AlertingService],
})
export class AlertingModule {}
