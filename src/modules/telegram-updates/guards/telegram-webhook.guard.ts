import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

export type TelegramWebhookRequest = Request & {
  telegramWebhook?:
    | {
        isAuthenticated: true;
      }
    | {
        isAuthenticated: false;
        reason: string;
      };
};

/**
 * Telegram webhook MUST always respond 200, otherwise Telegram retries.
 *
 * So this guard NEVER throws and NEVER returns false (which would cause 403).
 * Instead, it records whether the webhook secret is authentic; the controller
 * can safely no-op when authentication fails.
 */
@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TelegramWebhookRequest>();

    const secretHeader = request.headers['x-telegram-bot-api-secret-token'] as
      string | undefined;

    const expectedSecret = process.env.BOT_SECRET;
    if (!expectedSecret || secretHeader !== expectedSecret) {
      request.telegramWebhook = {
        isAuthenticated: false,
        reason: 'Invalid secret token',
      };
      return true;
    }

    request.telegramWebhook = { isAuthenticated: true };

    return true;
  }
}
