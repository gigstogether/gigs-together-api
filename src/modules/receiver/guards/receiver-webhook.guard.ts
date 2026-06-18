import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { TGUpdate } from '../../telegram/types/update.types';
import { AuthorizationService } from '../../auth/authorization.service';

export type ReceiverWebhookRequest = Request & {
  telegramWebhook?: {
    allowed: boolean;
    reason?: string;
  };
};

/**
 * Telegram webhook MUST always respond 200, otherwise Telegram retries.
 *
 * So this guard NEVER throws and NEVER returns false (which would cause 403).
 * Instead, it marks the request as allowed/denied; controller handler can no-op
 * when denied.
 */
@Injectable()
export class ReceiverWebhookGuard implements CanActivate {
  constructor(private readonly authorizationService: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ReceiverWebhookRequest>();

    const secretHeader = request.headers['x-telegram-bot-api-secret-token'] as
      | string
      | undefined;

    const expectedSecret = process.env.BOT_SECRET;
    if (!expectedSecret || secretHeader !== expectedSecret) {
      request.telegramWebhook = {
        allowed: false,
        reason: 'Invalid secret token',
      };
      return true;
    }

    const update: TGUpdate = request.body;
    const telegramId =
      update?.message?.from?.id || update?.callback_query?.from?.id;

    const isAdmin = telegramId
      ? await this.authorizationService.isAdmin(telegramId)
      : false;

    // TODO: open some features for other users
    request.telegramWebhook = {
      allowed: isAdmin === true,
      reason: isAdmin === true ? undefined : 'Admin privileges required',
    };

    return true;
  }
}
