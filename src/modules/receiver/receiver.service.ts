import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigModerationService } from '../gig/gig-moderation.service';
import {
  CallbackScope,
  GigCandidateCallbackAction,
  GigCallbackAction,
  parseCallbackData,
} from '../telegram/callback-action';
import { TelegramService } from '../telegram/telegram.service';
import type { TGMessage } from '../telegram/types/message.types';
import type { TGCallbackQuery } from '../telegram/types/update.types';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

enum Command {
  Start = 'start',
}

@Injectable()
export class ReceiverService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly gigModerationService: GigModerationService,
    private readonly gigCandidateService: GigCandidateService,
  ) {}

  private readonly logger = new Logger(ReceiverService.name);

  private formatCallbackQueryError(e: unknown): string {
    const tgDescription = this.readTelegramErrorDescription(e);
    if (tgDescription !== undefined) {
      return `Failed: ${tgDescription}`;
    }

    if (e instanceof BadRequestException) {
      return `Failed: ${this.readBadRequestMessage(e)}`;
    }

    if (e instanceof Error) {
      return `Failed: ${e.message}`;
    }
    return 'Failed: unknown error';
  }

  private readTelegramErrorDescription(e: unknown): string | undefined {
    if (typeof e !== 'object' || e === null || !('response' in e)) {
      return undefined;
    }
    const response = e.response;
    if (
      typeof response !== 'object' ||
      response === null ||
      !('data' in response)
    ) {
      return undefined;
    }
    const data = response.data;
    if (typeof data !== 'object' || data === null || !('description' in data)) {
      return undefined;
    }
    return typeof data.description === 'string' ? data.description : undefined;
  }

  private readBadRequestMessage(e: BadRequestException): string {
    const res = e.getResponse();
    if (typeof res === 'string') {
      return res;
    }
    if (typeof res === 'object' && res !== null && 'message' in res) {
      const message = res.message;
      if (Array.isArray(message)) {
        return message.map(String).join(', ');
      }
      if (message !== undefined && message !== null) {
        return String(message);
      }
    }
    return e.message;
  }

  async handleMessage(message: TGMessage): Promise<void> {
    const chatId = message?.chat?.id;
    if (!chatId) {
      return;
    }

    const text = message.text || '';

    if (text.charAt(0) !== '/') {
      await this.telegramService.sendMessage({
        chat_id: chatId,
        text: `At the moment, the bot can't receive messages. If you have an issue, feel free to contact the admins here: `,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Contact "Gigs Together!"',
                url: process.env.DIRECT_MESSAGES_URL,
              },
            ],
          ],
        },
      });
      return;
    }

    const command = text.substring(1).toLowerCase();
    await this.handleCommand(command, chatId);
  }

  private async handleCommand(command: string, chatId: number) {
    switch (command) {
      case Command.Start: {
        await this.telegramService.sendMessage({
          chat_id: chatId,
          text: `Hi! I'm a Gigs Together bot. I am still in development...`,
        });
        break;
      }
      default: {
        await this.telegramService.sendMessage({
          chat_id: chatId,
          text: `Hey there, I don't know that command.`,
        });
      }
    }
  }

  // TODO: move to telegram module and use dependency injection?
  private async processCallbackQueryOrThrow(
    callbackQuery: TGCallbackQuery,
    adminUserId: string,
  ): Promise<void> {
    const { data, message } = callbackQuery;
    if (!data || !message) {
      await this.telegramService.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Invalid callback payload',
        show_alert: false,
      });
      return;
    }

    const parsed = parseCallbackData(data);
    if (!parsed) {
      await this.telegramService.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Something unexpected happened, I dunno what to do',
        show_alert: true,
      });
      return;
    }

    // TODO: some more security?
    switch (parsed.scope) {
      case CallbackScope.Gig: {
        switch (parsed.action) {
          case GigCallbackAction.Post: {
            await this.gigModerationService.publishGigPost({
              gigId: parsed.id,
              expectedVersion: parsed.expectedVersion,
              moderationPost: {
                messageId: message.message_id,
                chatId: message.chat.id,
              },
            });
            break;
          }
        }
        break;
      }
      case CallbackScope.GigCandidate: {
        switch (parsed.action) {
          case GigCandidateCallbackAction.SendToModeration: {
            await this.gigCandidateService.sendGigCandidateToModeration({
              gigCandidateId: parsed.id,
              expectedVersion: parsed.expectedVersion,
            });
            break;
          }
          case GigCandidateCallbackAction.Reject: {
            await this.gigCandidateService.rejectGigCandidate({
              gigCandidateId: parsed.id,
              expectedVersion: parsed.expectedVersion,
              rejectedByUserId: adminUserId,
            });
            break;
          }
          case GigCandidateCallbackAction.Approve: {
            await this.gigCandidateService.approveGigCandidate({
              gigCandidateId: parsed.id,
              expectedVersion: parsed.expectedVersion,
              approvedByUserId: adminUserId,
            });
            break;
          }
        }
        break;
      }
    }

    await this.telegramService.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Done!',
      show_alert: false,
    });
  }

  async handleCallbackQuery(
    callbackQuery: TGCallbackQuery,
    adminUserId: string,
  ): Promise<void> {
    try {
      await this.processCallbackQueryOrThrow(callbackQuery, adminUserId);
    } catch (e) {
      this.logger.warn(
        `handleCallbackQuery failed: ${JSON.stringify(
          e?.response?.data ?? e?.message ?? e,
        )}`,
      );
      await this.telegramService.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: this.formatCallbackQueryError(e),
        show_alert: true,
      });
    }
  }
}
