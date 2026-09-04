import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseFilters,
  UseGuards,
  Version,
} from '@nestjs/common';
import type { TGUpdate } from '../telegram/types/update.types';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { ReceiverWebhookExceptionFilter } from './filters/receiver-webhook-exception.filter';
import { ReceiverWebhookGuard } from './guards/receiver-webhook.guard';
import type { ReceiverWebhookRequest } from './guards/receiver-webhook.guard';
import { ReceiverService } from './receiver.service';

@Controller('receiver')
@UseFilters(ReceiverExceptionFilter)
export class ReceiverController {
  constructor(private readonly receiverService: ReceiverService) {}

  @Version('1')
  @Post('webhook')
  @HttpCode(200)
  @UseFilters(ReceiverWebhookExceptionFilter)
  @UseGuards(ReceiverWebhookGuard)
  handleUpdate(
    @Req() req: ReceiverWebhookRequest,
    @Body() update: TGUpdate,
  ): Promise<void> {
    // Telegram must always receive 200, but we still want to process updates only from admins.
    // TelegramWebhookGuard marks request.telegramWebhook.allowed; when denied we just no-op.
    // (No throwing here — avoid 4xx which triggers Telegram retries.)
    if (req.telegramWebhook?.allowed !== true) {
      return Promise.resolve();
    }

    if (update.callback_query) {
      return this.receiverService.handleCallbackQuery(
        update.callback_query,
        req.telegramWebhook.userId,
      );
    }
    if (update.message) {
      return this.receiverService.handleMessage(update.message);
    }
    return Promise.resolve();
  }
}
