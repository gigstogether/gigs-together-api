import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { TGChatId, TGMessage } from '../telegram/types/message.types';
import { GigService } from '../gig/gig.service';
import { GigId } from '../gig/types/gig.types';
import { Status } from '../gig/types/status.enum';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import { TelegramService } from '../telegram/telegram.service';
import { Action } from '../telegram/types/action.enum';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import type { User } from '../../shared/types/user.types';
import type { V1ReceiverCreateGigRequestBody } from './types/requests/v1-receiver-create-gig-request';
import { CalendarService } from '../calendar/calendar.service';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import type { UpdateQuery } from 'mongoose';
import type { Gig } from '../gig/gig.schema';
import type { V1ReceiverUpdateGigByPublicIdResponseBody } from './types/requests/v1-receiver-gig-by-public-id-request';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

enum Command {
  Start = 'start',
}

interface HandleGigApprovePayload {
  gigId: GigId;
  moderationPost: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
}

interface UpdateGigByPublicIdPayload {
  publicId: string;
  body: V1ReceiverCreateGigRequestBody;
  posterFile: Express.Multer.File | undefined;
}

interface HandleGigRejectPayload {
  gigId: GigId;
  chatId: TGChatId;
  messageId: TGMessage['message_id'];
}

@Injectable()
export class ReceiverService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly gigService: GigService,
    private readonly calendarService: CalendarService,
  ) {}

  private readonly logger = new Logger(ReceiverService.name);

  private formatCallbackQueryError(e: any): string {
    const data = e?.response?.data;
    const tgDescription: string | undefined = data?.description;
    if (tgDescription) return `Failed: ${tgDescription}`;

    if (e instanceof BadRequestException) {
      const res = e.getResponse() as unknown;
      const msg =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res !== null && 'message' in res
            ? Array.isArray((res as { message?: unknown }).message)
              ? (res as { message: string[] }).message.join(', ')
              : String((res as { message?: unknown }).message ?? e.message)
            : e.message;
      return `Failed: ${String(msg)}`;
    }

    if (e instanceof Error) return `Failed: ${e.message}`;
    return 'Failed: unknown error';
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

    const [action, callbackPayload] = data.split(':');
    // TODO: some more security?
    switch (action) {
      case Action.Approve: {
        await this.handleGigApprove({
          gigId: callbackPayload,
          moderationPost: {
            messageId: message.message_id,
            chatId: message.chat.id,
          },
        });
        break;
      }
      case Action.Reject: {
        await this.handleGigReject({
          gigId: callbackPayload,
          messageId: message.message_id,
          chatId: message.chat.id,
        });
        break;
      }
      case Action.Rejected: {
        const text = "There's no action for Rejected yet.";
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text,
          show_alert: false,
        });
        return;
      }
      case Action.Status: {
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text: callbackPayload ? `Status is ${callbackPayload}` : undefined,
          show_alert: false,
        });
        return;
      }
      default: {
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text: 'Something unexpected happened, I dunno what to do',
          show_alert: true,
        });
        return;
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
  ): Promise<void> {
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
    if (authorTelegramId) {
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

  async handleGigApprove(payload: HandleGigApprovePayload): Promise<void> {
    const { gigId, moderationPost } = payload;
    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Approved,
    );
    const tgPublishPost = await this.telegramService.publishMain(updatedGig);

    const publishedChatId =
      tgPublishPost?.sender_chat?.id ?? tgPublishPost?.chat?.id;
    const publishedMessageId = tgPublishPost?.message_id;
    const publishedFileId = getBiggestTgPhotoFileId(tgPublishPost?.photo); // but should be the same as in moderation one

    const updateGigPayload: UpdateQuery<Gig> = {
      status: Status.Published,
    };

    if (tgPublishPost && publishedChatId && publishedMessageId) {
      updateGigPayload.$push = {
        posts: {
          id: publishedMessageId,
          chatId: publishedChatId,
          fileId: publishedFileId,
          to: Messenger.Telegram,
          type: PostType.Publish,
          date: tgPublishPost.date * 1_000, // Telegram date is Unix seconds; gig post date is Unix ms
        },
      };
    }

    await this.gigService.updateGig(gigId, updateGigPayload);
    this.logger.log(`Gig #${gigId} approved`);

    // Optional: update the feed cache on the frontend (ISR on-demand).
    await this.revalidateFrontendFeed({
      country: updatedGig.country,
      city: updatedGig.city,
    });

    if (tgPublishPost) {
      await this.telegramService.handleAfterPublish({
        title: updatedGig.title,
        publicId: updatedGig.publicId,
        suggestedBy: updatedGig.suggestedBy,
        moderationPost,
        publishPost: {
          username: tgPublishPost.chat.username,
          chatId: tgPublishPost.chat.id,
          messageId: tgPublishPost.message_id,
        },
      });
    } else {
      this.logger.warn(
        `publishMain returned no Telegram message for gig ${gigId}; skipping handleAfterPublish`,
      );
    }

    const calendarGig = this.gigService.gigToCalendarPayload(updatedGig);
    await this.calendarService.addEvent(calendarGig);
  }

  private buildFeedPath(input: { country: string; city: string }): string {
    const country = (input.country ?? '').trim().toLowerCase();
    const city = (input.city ?? '').trim().toLowerCase();
    if (!country || !city) {
      throw new Error('Missing country/city for feed path');
    }
    return `/feed/${encodeURIComponent(country)}/${encodeURIComponent(city)}`;
  }

  private async revalidateFrontendFeed(input: {
    readonly country?: string;
    readonly city?: string;
  }): Promise<void> {
    // TODO: extract?
    const baseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const secret = (process.env.FEED_REVALIDATE_SECRET ?? '').trim();
    if (!baseUrl || !secret) return;

    if (!/^https?:\/\//i.test(baseUrl)) {
      this.logger.warn(
        `APP_BASE_URL must be an absolute http(s) URL for revalidation (got "${baseUrl}")`,
      );
      return;
    }

    const url = new URL('/api/revalidate/feed', baseUrl).toString();
    let path: string | undefined;
    try {
      if (input.country && input.city) {
        path = this.buildFeedPath({ country: input.country, city: input.city });
      }
    } catch (e) {
      this.logger.warn(
        `Failed to build feed path for revalidation: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      path = undefined;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify(path ? { paths: [path] } : {}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Frontend revalidate failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Frontend revalidate request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async handleGigReject(payload: HandleGigRejectPayload): Promise<void> {
    const { gigId, chatId, messageId } = payload;
    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Rejected,
    );
    this.logger.log(`Gig #${gigId} rejected`);

    await this.telegramService.handlePostReject({
      suggestedBy: updatedGig.suggestedBy,
      moderationMessage: { chatId, messageId },
      gigId,
      title: updatedGig.title,
    });
  }
}
