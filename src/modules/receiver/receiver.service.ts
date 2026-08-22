import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { TGMessage } from '../telegram/types/message.types';
import { GigService } from '../gig/gig.service';
import { Status } from '../gig/types/status.enum';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import { TelegramService } from '../telegram/telegram.service';
import {
  CallbackScope,
  GigCallbackAction,
  GigCandidateCallbackAction,
  parseCallbackData,
} from '../telegram/callback-action';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import type { User } from '../auth/types/user.types';
import type { V1ReceiverCreateGigRequestBody } from './types/requests/v1-receiver-create-gig-request';
import type { V1ReceiverCreateGigResponseBody } from './types/requests/v1-receiver-gig-by-public-id-request';
import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import type { UpdateQuery } from 'mongoose';
import type { Gig } from '../gig/gig.schema';
import type { V1ReceiverUpdateGigByPublicIdResponseBody } from './types/requests/v1-receiver-gig-by-public-id-request';
import { GigModerationService } from '../gig/gig-moderation.service';
import { GigCandidateModerationService } from '../gig-candidate/gig-candidate-moderation.service';
import { envBool } from '../../shared/utils/env';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

enum Command {
  Start = 'start',
}

interface UpdateGigByPublicIdPayload {
  publicId: string;
  body: V1ReceiverCreateGigRequestBody;
  posterFile: Express.Multer.File | undefined;
}

@Injectable()
export class ReceiverService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly gigService: GigService,
    private readonly gigModerationService: GigModerationService,
    private readonly gigCandidateModerationService: GigCandidateModerationService,
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
          case GigCallbackAction.Approve: {
            await this.gigModerationService.approveGig({
              gigId: parsed.id,
              moderationPost: {
                messageId: message.message_id,
                chatId: message.chat.id,
              },
            });
            break;
          }
          case GigCallbackAction.Post: {
            await this.gigModerationService.publishGigPost({
              gigId: parsed.id,
              moderationPost: {
                messageId: message.message_id,
                chatId: message.chat.id,
              },
            });
            break;
          }
          case GigCallbackAction.Reject: {
            await this.gigModerationService.rejectGig({
              gigId: parsed.id,
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
          case GigCandidateCallbackAction.Accept: {
            await this.gigCandidateModerationService.accept({
              gigCandidateId: parsed.id,
              suggestionPost: {
                messageId: message.message_id,
                chatId: message.chat.id,
              },
            });
            break;
          }
          case GigCandidateCallbackAction.Reject: {
            await this.gigCandidateModerationService.reject({
              gigCandidateId: parsed.id,
              suggestionPost: {
                messageId: message.message_id,
                chatId: message.chat.id,
              },
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
      await this.processCallbackQueryOrThrow(callbackQuery);
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

  async handleGigSubmit(
    body: V1ReceiverCreateGigRequestBody,
    user: User,
    posterFile: Express.Multer.File | undefined,
  ): Promise<V1ReceiverCreateGigResponseBody> {
    const savedGig = await this.gigService.saveGig({ body, user, posterFile });
    let tgModerationPost: TGMessage | undefined;
    try {
      tgModerationPost = await this.telegramService.sendToModeration(savedGig);
    } catch (e) {
      // Publishing to Telegram shouldn't block gig creation.
      this.logger.warn(
        `publishDraft failed: ${JSON.stringify(e?.response?.data ?? e?.message ?? e)}`,
      );
      tgModerationPost = undefined;
    }

    const biggestTgPhotoFileId = getBiggestTgPhotoFileId(
      tgModerationPost?.photo,
    );

    const moderationChatId =
      tgModerationPost?.sender_chat?.id ?? tgModerationPost?.chat?.id;
    const moderationMessageId = tgModerationPost?.message_id;

    const updateGigPayload: UpdateQuery<Gig> = {
      status: Status.Pending,
    };

    if (tgModerationPost && moderationChatId && moderationMessageId) {
      updateGigPayload.$push = {
        posts: {
          id: moderationMessageId,
          chatId: moderationChatId,
          fileId: biggestTgPhotoFileId,
          to: Messenger.Telegram,
          type: PostType.Moderation,
          date: tgModerationPost.date * 1_000, // Telegram date is Unix seconds; gig post date is Unix ms
        },
      };
    }

    // Notify the author in DM.
    // NOTE: Telegram may reject sending DMs if the user hasn't started the bot.
    const authorTelegramId = user.tgUser.id;
    const shouldSendGigSubmissionFeedbackToAdmins = envBool(
      'SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS',
      false,
    );
    const canSendSubmissionFeedback =
      (!user.isAdmin || shouldSendGigSubmissionFeedbackToAdmins) &&
      authorTelegramId !== undefined;

    if (canSendSubmissionFeedback) {
      try {
        const feedbackMsg = await this.telegramService.sendSubmissionFeedback(
          savedGig,
          authorTelegramId,
        );
        if (feedbackMsg) {
          updateGigPayload['suggestedBy.feedbackMessageId'] =
            feedbackMsg.message_id;
        }
      } catch (e) {
        // DM notification shouldn't block gig creation.
        this.logger.warn(
          `notifyAuthorInDm failed: ${JSON.stringify(e?.response?.data ?? e?.message ?? e)}`,
        );
      }
    }

    try {
      await this.gigService.updateGig(savedGig._id, updateGigPayload);
    } catch (e) {
      this.logger.error(
        'updateGig failed',
        e instanceof Error ? e.stack : undefined,
      );
    }

    return { publicId: savedGig.publicId };
  }

  async updateGigByPublicId(
    payload: UpdateGigByPublicIdPayload,
  ): Promise<V1ReceiverUpdateGigByPublicIdResponseBody> {
    const { publicId, body, posterFile } = payload;

    const updatedGig = await this.gigService.updateGigByPublicId({
      publicId,
      body,
      posterFile,
    });

    const { poster } = updatedGig;

    switch (updatedGig.status) {
      case Status.New:
      case Status.Rejected:
      case Status.Approved:
      case Status.Pending: {
        // TODO: refactor
        try {
          const edited = await this.telegramService.editModerationPost(
            updatedGig,
            {
              updateMedia: !!poster,
            },
          );

          if (poster && edited?.photo?.length) {
            const newFileId = getBiggestTgPhotoFileId(edited.photo);
            if (newFileId) {
              try {
                await this.gigService.updateTelegramPostFileId({
                  gigId: updatedGig._id,
                  type: PostType.Moderation,
                  fileId: newFileId,
                });
              } catch (e) {
                this.logger.warn(
                  `updateTelegramPostFileId (Moderation) failed for publicId=${publicId}: ${JSON.stringify(
                    e?.response?.data ?? e?.message ?? e,
                  )}`,
                );
              }
            }
          }
        } catch (e) {
          // Telegram failures must not break the update flow.
          this.logger.warn(
            `editModerationPost failed for publicId=${publicId}: ${JSON.stringify(
              e?.response?.data ?? e?.message ?? e,
            )}`,
          );
        }
        break;
      }
      case Status.Published: {
        try {
          const edited = await this.telegramService.editMainPost(updatedGig, {
            updateMedia: !!poster,
          });

          if (poster && edited?.photo?.length) {
            const newFileId = getBiggestTgPhotoFileId(edited.photo);
            if (newFileId) {
              try {
                await this.gigService.updateTelegramPostFileId({
                  gigId: updatedGig._id,
                  type: PostType.Publish,
                  fileId: newFileId,
                });
              } catch (e) {
                this.logger.warn(
                  `updateTelegramPostFileId (Publish) failed for publicId=${publicId}: ${JSON.stringify(
                    e?.response?.data ?? e?.message ?? e,
                  )}`,
                );
              }
            }
          }
        } catch (e) {
          // Telegram failures must not break the update flow.
          this.logger.warn(
            `editMainPost failed for publicId=${publicId}: ${JSON.stringify(
              e?.response?.data ?? e?.message ?? e,
            )}`,
          );
        }
        break;
      }
    }
    return { publicId };
  }
}
