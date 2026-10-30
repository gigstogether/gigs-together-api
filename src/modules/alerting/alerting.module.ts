import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ALERT_DELIVERY } from './alert-delivery';
import { AlertingService } from './alerting.service';
import { TelegramAlertDeliveryService } from './telegram-alert-delivery.service';

@Module({
  imports: [TelegramModule],
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
