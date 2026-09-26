import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  TGInlineKeyboardMarkup,
  TGSendPhoto,
} from './types/message.types';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import type { GigPost, GigPoster } from '../gig/types/gig.types';
import type { PlainGig } from '../gig/types/gig.types';
import {
  CallbackScope,
  encodeCallbackData,
  GigCallbackAction,
} from './callback-action';
import { PostType } from '../../shared/types/post-type.enum';
import { Messenger } from '../../shared/types/messenger.enum';
import { BucketService } from '../bucket/bucket.service';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { TelegramTemplateService } from './telegram-template.service';
import type {
  BuildGigModerationReplyMarkupParams,
  BuildCaptionPayload,
  BuildGigPermalinkPayload,
  BuildGigModerationCaptionPayload,
  ComposeGigPostEditParams,
  GetPostUrlPayload,
  TelegramPostEditComposition,
} from './telegram-post-composer.service.types';
import { PostEditKind } from './telegram-post-composer.service.types';

export enum AdminMiniAppStartAction {
  EditGig = 'editGig',
  EditGigCandidate = 'editGigCandidate',
  OpenGig = 'openGig',
  OpenGigCandidate = 'openGigCandidate',
}

const DATE_LOCALE = 'en-GB';
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  weekday: 'short',
};

const ADMIN_MINI_APP_START_ACTION_SEPARATOR = '-';

/**
 * Composes Telegram Bot API payloads for gig-related channel/moderation posts
 * (captions, inline keyboards, permalink URLs, edit payloads).
 *
 * Does not call the Bot HTTP API — callers send via {@link TelegramBotClient}.
 */
@Injectable()
export class TelegramPostComposerService {
  constructor(
    private readonly bucketService: BucketService,
    private readonly postTemplates: TelegramTemplateService,
  ) {}

  private addTelegramCacheBustToUrl(url: string): string {
    const cacheBustedUrl = new URL(url);
    cacheBustedUrl.searchParams.set('tgcb', String(Date.now()));
    return cacheBustedUrl.toString();
  }

  composeGigPostEdit(
    params: ComposeGigPostEditParams,
  ): TelegramPostEditComposition {
    if (params.post.to !== Messenger.Telegram) {
      throw new BadRequestException('Cannot edit a non-Telegram Gig post');
    }

    switch (params.post.type) {
      case PostType.Main:
        return this.composeGigMainPostEdit(params);
      case PostType.Moderation:
        return this.composeGigModerationPostEdit(params);
      case PostType.Intake:
        throw new BadRequestException('Cannot edit an intake post for a Gig');
    }
  }

  private composeGigModerationPostEdit(
    params: ComposeGigPostEditParams,
  ): TelegramPostEditComposition {
    const { gig, post, isMediaUpdateRequired } = params;
    const chatId = post.chatId;
    const messageId = post.id;
    const mainPost = this.pickTgPost(gig.posts, PostType.Main);
    let mainPostUrl: string | undefined;
    if (mainPost !== undefined) {
      mainPostUrl = this.getPostUrl({
        chatId: mainPost.chatId,
        messageId: mainPost.id,
      });
    }

    const replyMarkup = this.buildGigModerationReplyMarkup({
      gigId: gig.id,
      expectedVersion: gig.version,
      isVisible: gig.isVisible,
      mainPostUrl,
      editGigUrl: this.buildEditGigUrl(gig.publicId),
    });
    const gigUrl = this.buildGigPermalink({
      baseUrl: this.getAppBaseUrl(),
      publicId: gig.publicId,
    });
    const fullCaption = this.buildGigModerationCaption({
      title: gig.title,
      gigUrl,
      mainPostUrl,
      adminGigUrl: this.buildAdminGigUrl(gig.publicId),
    });

    if (isMediaUpdateRequired && post.fileId) {
      let mediaReference = params.mediaReference;
      if (mediaReference === undefined) {
        mediaReference = this.getTelegramPosterUrl(gig.poster);
      }
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

  private composeGigMainPostEdit(
    params: ComposeGigPostEditParams,
  ): TelegramPostEditComposition {
    const { gig, post, isMediaUpdateRequired } = params;
    const chatId = post.chatId;
    const messageId = post.id;

    const caption = this.buildMainPostCaption(gig);

    if (isMediaUpdateRequired && post.fileId) {
      let mediaReference = params.mediaReference;
      if (mediaReference === undefined) {
        mediaReference = this.getTelegramPosterUrl(gig.poster);
      }
      if (mediaReference) {
        return {
          kind: PostEditKind.Media,
          payload: {
            chatId,
            messageId,
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
          chatId,
          messageId,
          caption,
          parseMode: TGParseMode.HTML,
          disableWebPagePreview: true,
        },
      };
    }

    return {
      kind: PostEditKind.Text,
      payload: {
        chatId,
        messageId,
        text: caption,
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
      },
    };
  }

  private buildMainPostCaption(gig: PlainGig): string {
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const url = this.buildGigPermalink({
      baseUrl: appBaseUrl,
      publicId: gig.publicId,
    });

    return this.buildCaption({
      url,
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });
  }

  buildCaption(payload: BuildCaptionPayload): string {
    const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
      year: DATE_FORMAT.year,
      month: DATE_FORMAT.month,
      day: DATE_FORMAT.day,
      weekday: DATE_FORMAT.weekday,
    });
    const date = dateFormatter.format(new Date(payload.date));
    const endDate = payload.endDate
      ? dateFormatter.format(new Date(payload.endDate))
      : undefined;
    const dates = [date, endDate].filter(Boolean).join(' - ');

    const templateKey = payload.url
      ? TELEGRAM_TEMPLATE_KEYS.mainGigWithLink
      : TELEGRAM_TEMPLATE_KEYS.mainGigWithoutLink;

    return this.postTemplates.render(templateKey, {
      url: payload.url,
      title: payload.title,
      dates,
      venue: payload.venue,
      ticketsUrl: payload.ticketsUrl,
    });
  }

  pickTgPost(
    posts: GigPost[] | undefined,
    type: PostType,
  ): GigPost | undefined {
    return posts?.find((post) => {
      return !!(
        post?.to === Messenger.Telegram &&
        post?.type === type &&
        post?.chatId &&
        post?.id
      );
    });
  }

  getTelegramPosterUrl(posterInfo?: GigPoster): string | undefined {
    if (!posterInfo) return;

    const { bucketPath, externalUrl } = posterInfo;
    if (bucketPath) {
      const bucketUrl = this.bucketService.getPublicFileUrl(bucketPath);
      if (bucketUrl) {
        // R2 poster URLs stay stable when their bytes are replaced. Telegram caches both fetched
        // media and failed fetches by URL, and editMessageMedia may return "message is not modified"
        // when the media string is unchanged. A fresh query value forces Telegram to fetch again.
        return this.addTelegramCacheBustToUrl(bucketUrl);
      }
    }
    // Arbitrary external URLs stay unchanged.
    return externalUrl;
  }

  composeMainPost(gig: PlainGig): TGSendPhoto {
    const chatIdRaw = process.env.MAIN_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      throw new BadRequestException(
        'Cannot compose main channel post: MAIN_CHANNEL_ID is not configured.',
      );
    }

    const caption = this.buildMainPostCaption(gig);

    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster =
      moderationPost?.fileId ?? this.getTelegramPosterUrl(gig.poster);

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

  buildEditGigUrl(publicId?: string): string | undefined {
    return publicId
      ? this.buildAdminMiniAppUrl(AdminMiniAppStartAction.EditGig, publicId)
      : undefined;
  }

  buildGigModerationReplyMarkup(
    params: BuildGigModerationReplyMarkupParams,
  ): TGInlineKeyboardMarkup | undefined {
    const { gigId, expectedVersion, isVisible, mainPostUrl, editGigUrl } =
      params;

    const row: Array<
      { text: string; url: string } | { text: string; callback_data: string }
    > = [];

    if (!mainPostUrl && gigId !== undefined) {
      row.push({
        text: this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.buttonPost),
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
        text: this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.buttonEdit),
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
        text: this.postTemplates.getText(visibilityTextKey),
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

  buildGigModerationCaption(payload: BuildGigModerationCaptionPayload): string {
    const titleLabel = payload.gigUrl
      ? this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigTitleWithLink, {
          url: payload.gigUrl,
          title: payload.title,
        })
      : this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigTitleWithoutLink, {
          title: payload.title,
        });

    const actionLinks = [
      payload.adminGigUrl
        ? this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigLinkOpenAdmin, {
            url: payload.adminGigUrl,
          })
        : undefined,
      payload.mainPostUrl
        ? this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigLinkSeeMainPost, {
            url: payload.mainPostUrl,
          })
        : undefined,
    ].filter((part): part is string => part !== undefined);

    return actionLinks.length === 0
      ? titleLabel
      : `${titleLabel}\n\n${actionLinks.join(' | ')}`;
  }

  buildGigPermalink(input: BuildGigPermalinkPayload): string | undefined {
    if (!input.baseUrl || !input.publicId) {
      return undefined;
    }

    return new URL(
      `/gigs/${encodeURIComponent(input.publicId)}`,
      input.baseUrl,
    ).toString();
  }

  buildAdminGigUrl(publicId?: string): string | undefined {
    return publicId
      ? this.buildAdminMiniAppUrl(AdminMiniAppStartAction.OpenGig, publicId)
      : undefined;
  }

  buildAdminMiniAppUrl(
    action: AdminMiniAppStartAction,
    resourceId: string,
  ): string | undefined {
    const miniAppBaseUrl = (process.env.EDIT_GIG_URL ?? '').trim();
    return miniAppBaseUrl
      ? `${miniAppBaseUrl}?startapp=${encodeURIComponent(`${action}${ADMIN_MINI_APP_START_ACTION_SEPARATOR}${resourceId}`)}`
      : undefined;
  }

  private getAppBaseUrl(): string {
    return (process.env.APP_BASE_URL ?? '').trim();
  }

  getPostUrl(payload: GetPostUrlPayload): string | undefined {
    const { chatUsername, messageId, chatId } = payload;

    if (!messageId) return;
    if (chatUsername) {
      return `https://t.me/${chatUsername}/${messageId}`;
    }
    if (chatId) {
      const rawChatId = String(chatId);
      const internalChatId = rawChatId.startsWith('-100')
        ? rawChatId.slice(4)
        : rawChatId;
      return `https://t.me/c/${internalChatId}/${messageId}`;
    }
  }
}
