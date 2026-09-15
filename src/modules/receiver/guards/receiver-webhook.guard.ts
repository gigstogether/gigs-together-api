import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { TGUpdate } from '../../telegram/types/update.types';
import { AuthorizationService } from '../../auth/authorization.service';
import { UserService } from '../../user/user.service';
import { Messenger } from '../../../shared/types/messenger.enum';
import type { TGUser } from '../../telegram/types/user.types';

export type ReceiverWebhookRequest = Request & {
  telegramWebhook?:
    | {
        allowed: true;
        userId: string;
      }
    | {
        allowed: false;
        reason: string;
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
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ReceiverWebhookRequest>();

    const secretHeader = request.headers['x-telegram-bot-api-secret-token'] as
      string | undefined;

    const expectedSecret = process.env.BOT_SECRET;
    if (!expectedSecret || secretHeader !== expectedSecret) {
      request.telegramWebhook = {
        allowed: false,
        reason: 'Invalid secret token',
      };
      return true;
    }

    const update: TGUpdate = request.body;
    const telegramUser = update?.message?.from ?? update?.callback_query?.from;
    const adminUserId = telegramUser
      ? await this.resolveAdminUserId(telegramUser)
      : undefined;

    // TODO: open some features for other users
    request.telegramWebhook = {
      ...(adminUserId
        ? { allowed: true, userId: adminUserId }
        : { allowed: false, reason: 'Admin privileges required' }),
    };

    return true;
  }

  private async resolveAdminUserId(
    telegramUser: TGUser,
  ): Promise<string | undefined> {
    const user = await this.userService.findOrCreateMessengerUser({
      messenger: Messenger.Telegram,
      externalUserId: String(telegramUser.id),
      username: telegramUser.username,
      displayName: [telegramUser.first_name, telegramUser.last_name]
        .filter(
          (part): part is string => typeof part === 'string' && !!part.trim(),
        )
        .map((part) => part.trim())
        .join(' '),
    });
    const isAdmin = await this.authorizationService.isAdmin(user.id);
    return isAdmin ? user.id : undefined;
  }
}
