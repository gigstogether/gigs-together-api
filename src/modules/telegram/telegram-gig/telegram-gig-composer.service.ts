import { BadRequestException, Injectable } from '@nestjs/common';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import type { GigPost, PlainGig } from '../../gig/types/gig.types';
import {
  CallbackScope,
  encodeCallbackData,
  GigCallbackAction,
} from '../utils/telegram-callback-action';
import {
  AdminMiniAppStartAction,
  TelegramComposerService,
} from '../telegram-composer.service';
import type { TelegramPostEditComposition } from '../telegram-composer.service.types';
import { PostEditKind } from '../telegram-composer.service.types';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import { TelegramService } from '../telegram.service';
import type {
  TGInlineKeyboardMarkup,
  TGSendPhoto,
} from '../types/message.types';
import { TGInputMediaType, TGParseMode } from '../types/message.types';
import type {
  BuildGigModerationCaptionPayload,
  BuildGigModerationReplyMarkupParams,
  ComposeGigPostEditParams,
} from './telegram-gig-composer.service.types';

/**
 * Composes Telegram Bot API payloads for gig-related channel/moderation posts
 * (captions, inline keyboards, permalink URLs, edit payloads).
 *
 * Does not call the Bot HTTP API; callers send the composed payloads.
 */
@Injectable()
export class TelegramGigComposerService {
  constructor(
    private readonly telegramComposer: TelegramComposerService,
    private readonly telegramTemplates: TelegramTemplateService,
    private readonly telegramService: TelegramService,
  ) {}

  composePostEdit(
    params: ComposeGigPostEditParams,
  ): TelegramPostEditComposition {
    if (params.post.to !== Messenger.Telegram) {
      throw new BadRequestException('Cannot edit a non-Telegram Gig post');
    }

    switch (params.post.type) {
      case PostType.Main:
        return this.composeMainPostEdit(params);
      case PostType.Moderation:
        return this.composeModerationPostEdit(params);
      case PostType.Intake:
        throw new BadRequestException('Cannot edit an intake post for a Gig');
    }
  }

  composeMainPost(gig: PlainGig): TGSendPhoto {
    const chatId = (process.env.MAIN_CHANNEL_ID ?? '').trim();
    if (chatId === '') {
      throw new BadRequestException(
        'Cannot compose main channel post: MAIN_CHANNEL_ID is not configured.',
      );
    }

    const caption = this.buildMainPostCaption(gig);
    const moderationPost = this.pickPost(gig.posts, PostType.Moderation);
    const poster =
      moderationPost?.fileId ??
      this.telegramService.resolvePosterUrl(gig.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose main channel post: gig has no poster (moderation file_id or poster URL).',
      );
    }

    return {
      chat_id: chatId,
      photo: poster,
      caption,
      parse_mode: TGParseMode.HTML,
    };
  }

  pickPost(posts: GigPost[] | undefined, type: PostType): GigPost | undefined {
    return posts?.find((post) => {
      return !!(
        post?.to === Messenger.Telegram &&
        post?.type === type &&
        post?.chatId &&
        post?.id
      );
    });
  }

  buildEditUrl(publicId?: string): string | undefined {
    return publicId
      ? this.telegramComposer.buildAdminMiniAppUrl(
          AdminMiniAppStartAction.EditGig,
          publicId,
        )
      : undefined;
  }

  buildModerationReplyMarkup(
    params: BuildGigModerationReplyMarkupParams,
  ): TGInlineKeyboardMarkup | undefined {
    const { gigId, expectedVersion, isVisible, mainPostUrl, editGigUrl } =
      params;

    const row: Array<
      { text: string; url: string } | { text: string; callback_data: string }
    > = [];

    if (!mainPostUrl && gigId !== undefined) {
      row.push({
        text: this.telegramTemplates.getText(TELEGRAM_TEMPLATE_KEYS.buttonPost),
        callback_data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: GigCallbackAction.Post,
          id: String(gigId),
          expectedVersion,
        }),
      });
    }
    if (editGigUrl) {
      row.push({
        text: this.telegramTemplates.getText(TELEGRAM_TEMPLATE_KEYS.buttonEdit),
        url: editGigUrl,
      });
    }
    if (gigId !== undefined) {
      const visibilityAction = isVisible
        ? GigCallbackAction.Hide
        : GigCallbackAction.Show;
      const visibilityTextKey = isVisible
        ? TELEGRAM_TEMPLATE_KEYS.buttonHide
        : TELEGRAM_TEMPLATE_KEYS.buttonShow;

      row.push({
        text: this.telegramTemplates.getText(visibilityTextKey),
        callback_data: encodeCallbackData({
          scope: CallbackScope.Gig,
          action: visibilityAction,
          id: String(gigId),
          expectedVersion,
        }),
      });
    }

    if (row.length === 0) {
      return undefined;
    }

    return { inline_keyboard: [row] };
  }

  buildModerationCaption(payload: BuildGigModerationCaptionPayload): string {
    const titleLabel = payload.gigUrl
      ? this.telegramTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigTitleWithLink, {
          url: payload.gigUrl,
          title: payload.title,
        })
      : this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigTitleWithoutLink,
          {
            title: payload.title,
          },
        );

    const actionLinks = [
      payload.adminGigUrl
        ? this.telegramTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.gigLinkOpenAdmin,
            {
              url: payload.adminGigUrl,
            },
          )
        : undefined,
      payload.mainPostUrl
        ? this.telegramTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.gigLinkSeeMainPost,
            {
              url: payload.mainPostUrl,
            },
          )
        : undefined,
    ].filter((part): part is string => part !== undefined);

    return actionLinks.length === 0
      ? titleLabel
      : `${titleLabel}\n\n${actionLinks.join(' | ')}`;
  }

  buildAdminUrl(publicId?: string): string | undefined {
    return publicId
      ? this.telegramComposer.buildAdminMiniAppUrl(
          AdminMiniAppStartAction.OpenGig,
          publicId,
        )
      : undefined;
  }

  private composeModerationPostEdit(
    params: ComposeGigPostEditParams,
  ): TelegramPostEditComposition {
    const { gig, post, isMediaUpdateRequired } = params;
    const chatId = post.chatId;
    const messageId = post.id;
    const mainPost = this.pickPost(gig.posts, PostType.Main);
    const mainPostUrl =
      mainPost === undefined
        ? undefined
        : this.telegramComposer.buildPostUrl({
            chatId: mainPost.chatId,
            messageId: mainPost.id,
          });

    const replyMarkup = this.buildModerationReplyMarkup({
      gigId: gig.id,
      expectedVersion: gig.version,
      isVisible: gig.isVisible,
      mainPostUrl,
      editGigUrl: this.buildEditUrl(gig.publicId),
    });
    const gigUrl = this.telegramComposer.buildGigPermalink({
      baseUrl: this.getAppBaseUrl(),
      publicId: gig.publicId,
    });
    const fullCaption = this.buildModerationCaption({
      title: gig.title,
      gigUrl,
      mainPostUrl,
      adminGigUrl: this.buildAdminUrl(gig.publicId),
    });

    if (isMediaUpdateRequired && post.fileId) {
      const mediaReference =
        params.mediaReference ??
        this.telegramService.resolvePosterUrl(gig.poster);
      if (mediaReference) {
        return {
          kind: PostEditKind.Media,
          payload: {
            chatId,
            messageId,
            media: {
              type: TGInputMediaType.Photo,
              media: mediaReference,
              caption: fullCaption,
              parse_mode: TGParseMode.HTML,
            },
            replyMarkup,
          },
        };
      }
    }

    if (post.fileId) {
      return {
        kind: PostEditKind.Caption,
        payload: {
          chatId,
          messageId,
          caption: fullCaption,
          parseMode: TGParseMode.HTML,
          disableWebPagePreview: true,
          replyMarkup,
        },
      };
    }

    return {
      kind: PostEditKind.Text,
      payload: {
        chatId,
        messageId,
        text: fullCaption,
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
        replyMarkup,
      },
    };
  }

  private composeMainPostEdit(
    params: ComposeGigPostEditParams,
  ): TelegramPostEditComposition {
    const { gig, post, isMediaUpdateRequired } = params;
    const caption = this.buildMainPostCaption(gig);

    if (isMediaUpdateRequired && post.fileId) {
      const mediaReference =
        params.mediaReference ??
        this.telegramService.resolvePosterUrl(gig.poster);
      if (mediaReference) {
        return {
          kind: PostEditKind.Media,
          payload: {
            chatId: post.chatId,
            messageId: post.id,
            media: {
              type: TGInputMediaType.Photo,
              media: mediaReference,
              caption,
              parse_mode: TGParseMode.HTML,
            },
          },
        };
      }
    }

    if (post.fileId) {
      return {
        kind: PostEditKind.Caption,
        payload: {
          chatId: post.chatId,
          messageId: post.id,
          caption,
          parseMode: TGParseMode.HTML,
          disableWebPagePreview: true,
        },
      };
    }

    return {
      kind: PostEditKind.Text,
      payload: {
        chatId: post.chatId,
        messageId: post.id,
        text: caption,
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
      },
    };
  }

  private buildMainPostCaption(gig: PlainGig): string {
    const url = this.telegramComposer.buildGigPermalink({
      baseUrl: this.getAppBaseUrl(),
      publicId: gig.publicId,
    });

    return this.telegramComposer.buildCaption({
      url,
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });
  }

  private getAppBaseUrl(): string {
    return (process.env.APP_BASE_URL ?? '').trim();
  }
}
