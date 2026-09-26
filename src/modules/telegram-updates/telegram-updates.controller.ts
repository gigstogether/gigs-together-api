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
import { TelegramUpdatesExceptionFilter } from './filters/telegram-updates-exception.filter';
import { TelegramWebhookExceptionFilter } from './filters/telegram-webhook-exception.filter';
import { TelegramWebhookGuard } from './guards/telegram-webhook.guard';
import type { TelegramWebhookRequest } from './guards/telegram-webhook.guard';
import { TelegramUpdatesService } from './telegram-updates.service';

@Controller('telegram/updates')
@UseFilters(TelegramUpdatesExceptionFilter)
export class TelegramUpdatesController {
  constructor(
    private readonly telegramUpdatesService: TelegramUpdatesService,
  ) {}

  @Version('1')
  @Post()
  @HttpCode(200)
  @UseFilters(TelegramWebhookExceptionFilter)
  @UseGuards(TelegramWebhookGuard)
  handleUpdate(
    @Req() req: TelegramWebhookRequest,
    @Body() update: TGUpdate,
  ): Promise<void> {
    // Telegram must always receive 200, including for rejected webhook requests.
    if (req.telegramWebhook?.isAuthenticated !== true) {
      return Promise.resolve();
    }

    if (update.callback_query) {
      return this.telegramUpdatesService.handleCallbackQuery(
        update.callback_query,
      );
    }
    if (update.message) {
      return this.telegramUpdatesService.handleMessage(update.message);
    }
    return Promise.resolve();
  }
}
