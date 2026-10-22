import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRequiredConfigString } from '../../shared/utils/env';
import { GigCandidateApprovalValidationError } from '../gig-candidate/gig-candidate-approval/gig-candidate-approval';
import { GigCandidateApprovalService } from '../gig-candidate/gig-candidate-approval/gig-candidate-approval.service';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import type { CreateMessengerGigCandidateParams } from '../gig-candidate/gig-candidate.service';
import { GigService } from '../gig/gig.service';
import { AuthorizationService } from '../auth/authorization.service';
import { UserService } from '../user/user.service';
import type { User } from '../user/types/user.types';
import { Messenger } from '../../shared/types/messenger.enum';
import {
  CallbackScope,
  GigCandidateCallbackAction,
  GigCallbackAction,
  parseCallbackData,
} from '../telegram/utils/telegram-callback-action';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramBotReplyService } from '../telegram/telegram-bot-reply/telegram-bot-reply.service';
import { formatTelegramErrorMessage } from '../telegram/utils/telegram-error';
import type { TGChat } from '../telegram/types/chat.types';
import type { TGMessage } from '../telegram/types/message.types';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import type { TGUser } from '../telegram/types/user.types';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

enum Command {
  Suggest = 'suggest',
  Start = 'start',
}

const GIG_SUGGESTION_RECEIVED_REACTION = '👍';

interface ParsedCommand {
  name: string;
  argument: string;
  targetBotUsername?: string;
}

interface UserCommandSender {
  type: 'user';
  userId: number;
}

interface ChannelCommandSender {
  type: 'channel';
}

type CommandSender = UserCommandSender | ChannelCommandSender;

interface HandleCommandParams extends ParsedCommand {
  chat: TGChat;
  messageId: number;
  sender: CommandSender;
  replyToMessage?: TGMessage;
}

interface HandleSuggestCommandParams {
  argument: string;
  chat: TGChat;
  messageId: number;
  sender: CommandSender;
  replyToMessage?: TGMessage;
}

const EXPLICIT_MESSAGE_CONTENT_KEYS: string[] = [
  'text',
  'rich_message',
  'animation',
  'audio',
  'document',
  'live_photo',
  'paid_media',
  'photo',
  'sticker',
  'story',
  'video',
  'video_note',
  'voice',
  'checklist',
  'contact',
  'dice',
  'game',
  'poll',
  'venue',
  'location',
];

@Injectable()
export class TelegramUpdatesService {
  private readonly gigSuggestionsChatId: number;

  constructor(
    private readonly telegramService: TelegramService,
    private readonly telegramBotReplyService: TelegramBotReplyService,
    private readonly gigService: GigService,
    private readonly gigCandidateService: GigCandidateService,
    private readonly gigCandidateApprovalService: GigCandidateApprovalService,
    private readonly userService: UserService,
    private readonly authorizationService: AuthorizationService,
    // A plain constructor parameter is scoped to the constructor body. In TypeScript, adding
    // public, protected, private, or readonly turns it into a parameter property on the instance.
    configService: ConfigService,
  ) {
    const chatIdRaw = getRequiredConfigString(configService, 'MAIN_CHAT_ID');
    const chatId = Number(chatIdRaw);
    if (!Number.isSafeInteger(chatId) || chatId === 0) {
      throw new Error('MAIN_CHAT_ID must be a non-zero safe integer.');
    }
    this.gigSuggestionsChatId = chatId;
  }

  private readonly logger = new Logger(TelegramUpdatesService.name);

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
    const chat = message?.chat;
    if (!chat?.id) {
      return;
    }

    const sender = this.getCommandSender(message);
    if (sender === undefined) {
      return;
    }

    const text = message.text ?? '';

    if (text.charAt(0) !== '/') {
      if (this.isGroupChat(chat)) {
        return;
      }
      await this.telegramBotReplyService.sendIncomingMessageUnavailable(chat);
      return;
    }

    const command = this.parseCommand(text);
    if (command === undefined) {
      await this.telegramBotReplyService.sendUnknownCommandResponse(chat);
      return;
    }
    if (!this.isCommandAddressedToThisBot(command.targetBotUsername)) {
      return;
    }

    const params: HandleCommandParams = {
      ...command,
      chat,
      messageId: message.message_id,
      sender,
    };
    if (message.reply_to_message !== undefined) {
      params.replyToMessage = message.reply_to_message;
    }
    await this.handleCommand(params);
  }

  private getCommandSender(message: TGMessage): CommandSender | undefined {
    const hasExplicitContent = EXPLICIT_MESSAGE_CONTENT_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(message, key),
    );
    if (!hasExplicitContent) {
      return;
    }

    if (message.sender_chat !== undefined) {
      if (message.sender_chat.type !== 'channel') {
        return;
      }
      return { type: 'channel' };
    }

    if (message.from?.is_bot !== false) {
      return;
    }

    return { type: 'user', userId: message.from.id };
  }

  private parseCommand(text: string): ParsedCommand | undefined {
    const match = /^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(
      text,
    );
    if (match === null) {
      return;
    }

    const name = match[1];
    if (name === undefined) {
      return;
    }

    const command: ParsedCommand = {
      name: name.toLowerCase(),
      argument: (match[3] ?? '').trim(),
    };
    const targetBotUsername = match[2];
    if (targetBotUsername !== undefined) {
      command.targetBotUsername = targetBotUsername;
    }
    return command;
  }

  private isCommandAddressedToThisBot(
    targetBotUsername: string | undefined,
  ): boolean {
    if (targetBotUsername === undefined) {
      return true;
    }

    const botUsername = this.telegramService.getBotUsername();

    return targetBotUsername.toLowerCase() === botUsername.toLowerCase();
  }

  private async handleCommand(params: HandleCommandParams): Promise<void> {
    const { name, argument, chat, messageId, sender, replyToMessage } = params;

    switch (name) {
      case Command.Suggest: {
        const suggestParams: HandleSuggestCommandParams = {
          argument,
          chat,
          messageId,
          sender,
        };
        if (replyToMessage !== undefined) {
          suggestParams.replyToMessage = replyToMessage;
        }
        await this.handleSuggestCommand(suggestParams);
        break;
      }
      case Command.Start: {
        await this.telegramBotReplyService.sendStartCommandResponse(chat);
        break;
      }
      default: {
        await this.telegramBotReplyService.sendUnknownCommandResponse(chat);
      }
    }
  }

  private async handleSuggestCommand(
    params: HandleSuggestCommandParams,
  ): Promise<void> {
    const { argument, chat, messageId, sender, replyToMessage } = params;
    if (chat.type === 'private') {
      await this.telegramBotReplyService.sendSuggestCommandUnavailableInPrivateChat(
        chat,
      );
      return;
    }
    if (!this.isGigSuggestionsChat(chat)) {
      return;
    }

    let originalText = argument;
    let sourceMessageId = messageId;
    if (replyToMessage !== undefined) {
      if (replyToMessage.text === undefined) {
        return;
      }
      originalText = replyToMessage.text.trim();
      sourceMessageId = replyToMessage.message_id;
    }
    if (originalText === '') {
      return;
    }

    try {
      const candidateParams: CreateMessengerGigCandidateParams = {
        messenger: Messenger.Telegram,
        chatId: chat.id,
        messageId: sourceMessageId,
        originalText,
      };
      if (sender.type === 'user') {
        const user = await this.userService.findActiveUserByMessengerIdentity({
          messenger: Messenger.Telegram,
          externalUserId: String(sender.userId),
        });
        if (user !== null) {
          candidateParams.userId = user.id;
        }
      }
      await this.gigCandidateService.submitMessengerGigCandidate(
        candidateParams,
      );
    } catch (e) {
      this.logger.error(
        `Saving Telegram gig suggestion failed for chatId=${chat.id} messageId=${sourceMessageId}: ${formatTelegramErrorMessage(e)}`,
      );
      return;
    }
    await this.setGigSuggestionReceivedReactionBestEffort(chat.id, messageId);
  }

  private async setGigSuggestionReceivedReactionBestEffort(
    chatId: number,
    messageId: number,
  ): Promise<void> {
    try {
      await this.telegramService.setMessageReaction({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji: GIG_SUGGESTION_RECEIVED_REACTION }],
      });
    } catch (e) {
      this.logger.warn(
        `Setting Telegram suggestion acknowledgement reaction failed for chatId=${chatId} messageId=${messageId}: ${formatTelegramErrorMessage(e)}`,
      );
    }
  }

  private isGigSuggestionsChat(chat: TGChat): boolean {
    if (!this.isGroupChat(chat)) {
      return false;
    }

    return chat.id === this.gigSuggestionsChatId;
  }

  private isGroupChat(chat: TGChat): boolean {
    return chat.type === 'group' || chat.type === 'supergroup';
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
          case GigCallbackAction.Hide: {
            await this.gigService.setGigVisibility({
              gigId: parsed.id,
              expectedVersion: parsed.expectedVersion,
              isVisible: false,
              moderationPost: {
                messageId: message.message_id,
                chatId: message.chat.id,
              },
            });
            break;
          }
          case GigCallbackAction.Show: {
            await this.gigService.setGigVisibility({
              gigId: parsed.id,
              expectedVersion: parsed.expectedVersion,
              isVisible: true,
              moderationPost: {
                messageId: message.message_id,
                chatId: message.chat.id,
              },
            });
            break;
          }
          case GigCallbackAction.Post: {
            await this.gigService.createGigMainPost({
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
            await this.gigCandidateApprovalService.approveGigCandidate({
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

  async handleCallbackQuery(callbackQuery: TGCallbackQuery): Promise<void> {
    try {
      const adminUserId = await this.resolveAdminUserId(callbackQuery.from);
      if (!adminUserId) {
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text: 'Admin privileges required',
          show_alert: true,
        });
        return;
      }

      await this.processCallbackQueryOrThrow(callbackQuery, adminUserId);
    } catch (e) {
      if (!(e instanceof GigCandidateApprovalValidationError)) {
        this.logger.warn(
          `handleCallbackQuery failed: ${formatTelegramErrorMessage(e)}`,
        );
      }
      await this.telegramService.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: this.formatCallbackQueryError(e),
        show_alert: true,
      });
    }
  }

  private async resolveAdminUserId(
    telegramUser: TGUser,
  ): Promise<string | undefined> {
    const user = await this.resolveUser(telegramUser);
    const isAdmin = await this.authorizationService.isAdmin(user.id);
    return isAdmin ? user.id : undefined;
  }

  private resolveUser(telegramUser: TGUser): Promise<User> {
    return this.userService.findOrCreateMessengerUser({
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
  }
}
