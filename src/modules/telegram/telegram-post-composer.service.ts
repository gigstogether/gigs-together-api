import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageText,
  TGMessage,
  TGSendMediaGroup,
  TGSendMessage,
  TGSendPhoto,
  TGChatId,
  TGInputMedia,
} from './types/message.types';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import type { TGChat } from './types/chat.types';
import { GigPost, GigPoster } from '../gig/gig.schema';
import type { GigId, PlainGig } from '../gig/types/gig.types';
import { Action } from './types/action.enum';
import { PostType } from '../gig/types/postType.enum';
import { Messenger } from '../gig/types/messenger.enum';
import type { TGInlineKeyboardMarkup } from './types/update.types';
import { BucketService } from '../bucket/bucket.service';
import { TELEGRAM_MEDIA_GROUP_MAX_ITEMS } from './telegram-bot.client';

export const TELEGRAM_MEDIA_CAPTION_MAX_CHARS = 1024;

export const WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN =
  'There are no gigs scheduled for this week.';

export enum PostEditKind {
  Media = 'media',
  Caption = 'caption',
  Text = 'text',
}

export enum WeeklyDigestMainChannelSendKind {
  SendMessage = 'sendMessage',
  SendPhoto = 'sendPhoto',
  SendMediaGroup = 'sendMediaGroup',
}

export interface ComposeWeeklyDigestParams {
  readonly chatId: TGChatId;
  readonly gigs: readonly PlainGig[];
}

export type WeeklyDigestMainChannelSendPlan =
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendMessage;
      readonly payload: TGSendMessage;
    }
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendPhoto;
      readonly payload: TGSendPhoto;
    }
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendMediaGroup;
      readonly payload: TGSendMediaGroup;
    };

type TelegramGigPostEditComposition =
  | { kind: PostEditKind.Media; payload: TGEditMessageMedia }
  | { kind: PostEditKind.Caption; payload: TGEditMessageCaption }
  | { kind: PostEditKind.Text; payload: TGEditMessageText };

interface BuildCaptionPayload {
  date: string | number | Date;
  endDate?: string | number | Date;
  venue: string;
  title: string;
  ticketsUrl: string;
  url?: string;
}

export interface BuildGigPermalinkPayload {
  baseUrl: string;
  country: string;
  city: string;
  publicId: string;
}

export interface GetPostUrlPayload {
  chatId?: TGChatId;
  chatUsername?: TGChat['username'];
  messageId: TGMessage['message_id'];
}

export interface BuildAfterPublishModerationReplyMarkupParams {
  readonly publishPostUrl?: string;
  readonly editGigUrl?: string;
}

interface ComposedText {
  plain: string;
  html: string;
}

const DATE_LOCALE = 'en-GB';
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  weekday: 'short',
};

/**
 * Composes Telegram Bot API payloads for gig-related channel/moderation posts
 * (captions, inline keyboards, permalink URLs, edit payloads).
 *
 * Does not call the Bot HTTP API — callers send via {@link TelegramBotClient}.
 */
@Injectable()
export class TelegramPostComposer {
  constructor(private readonly bucketService: BucketService) {}

  private addCacheBustToUrl(url: string, cacheBust: string): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}tgcb=${encodeURIComponent(cacheBust)}`;
  }

  private getPosterUrlForEdit(poster?: GigPoster): string | undefined {
    const url = this.getPosterUrl(poster);
    if (!url) return;
    // Poster URLs may stay stable (S3 key overwrite, CDN caching, etc). Telegram compares
    // the "media" string and may return 400 "message is not modified" if the URL is unchanged.
    // Cache-bust makes the URL string unique per edit.
    return this.addCacheBustToUrl(url, String(Date.now()));
  }

  composeModerationPostEdit(
    gig: PlainGig,
    opts?: { updateMedia?: boolean },
  ): TelegramGigPostEditComposition | undefined {
    const post = this.pickTgPost(gig.posts, PostType.Moderation);
    const chatId = post?.chatId;
    const messageId = post?.id;
    if (!chatId || !messageId) return undefined;

    const replyMarkup = this.buildModerationPostReplyMarkup(gig);

    const caption = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    if (opts?.updateMedia && post?.fileId) {
      const posterUrl = this.getPosterUrlForEdit(gig.poster);
      if (posterUrl) {
        return {
          kind: PostEditKind.Media,
          payload: {
            chatId,
            messageId,
            media: {
              type: TGInputMediaType.Photo,
              media: posterUrl,
              caption,
              parse_mode: TGParseMode.HTML,
            },
            replyMarkup,
          },
        };
      }
    }

    if (post?.fileId) {
      return {
        kind: PostEditKind.Caption,
        payload: {
          chatId,
          messageId,
          caption,
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
        text: caption,
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
        replyMarkup,
      },
    };
  }

  composeMainPostEdit(
    gig: PlainGig,
    opts?: { updateMedia?: boolean },
  ): TelegramGigPostEditComposition | undefined {
    const post = this.pickTgPost(gig.posts, PostType.Publish);
    const chatId = post?.chatId;
    const messageId = post?.id;
    if (!chatId || !messageId) return undefined;

    const caption = this.buildMainPostCaption(gig);

    if (opts?.updateMedia && post?.fileId) {
      const posterUrl = this.getPosterUrlForEdit(gig.poster);
      if (posterUrl) {
        return {
          kind: PostEditKind.Media,
          payload: {
            chatId,
            messageId,
            media: {
              type: TGInputMediaType.Photo,
              media: posterUrl,
              caption,
              parse_mode: TGParseMode.HTML,
            },
          },
        };
      }
    }

    if (post?.fileId) {
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
      country: gig.country,
      city: gig.city,
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

    return [
      payload.url
        ? `<a href="${payload.url}">${payload.title}</a>`
        : payload.title,
      '',
      `🗓 ${dates}`,
      `📍 ${payload.venue}`,
      '',
      `🎫 ${payload.ticketsUrl}`,
    ].join('\n');
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

  formatWeeklyDigestCaptionLines(gigDocs: readonly PlainGig[]): ComposedText {
    const formatter = new Intl.DateTimeFormat(DATE_LOCALE, {
      weekday: DATE_FORMAT.weekday,
      month: DATE_FORMAT.month,
      day: DATE_FORMAT.day,
    });

    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();

    const PREFIX = "Here's what is happening this week:";
    const GIGS_SEPARATOR = '\n\n';
    const GIG_INFO_SEPARATOR = '\n';
    const GIG_INFO_ITEMS_SEPARATOR = ' • ';
    const TICKETS = 'Tickets';

    const gigs = gigDocs.map((gig: PlainGig) => {
      const dateLabel = formatter.format(new Date(gig.date));
      const endDateLabel = gig.endDate
        ? formatter.format(new Date(gig.endDate))
        : undefined;
      const datesLabel = `${dateLabel}${endDateLabel ? ` — ${endDateLabel}` : ''}`;
      return {
        dates: datesLabel,
        title: gig.title,
        venue: gig.venue,
        ticketsUrl: gig.ticketsUrl,
        publicId: gig.publicId,
        city: gig.city,
        country: gig.country,
      };
    });

    const plainLines: string[] = [PREFIX];
    for (const gig of gigs) {
      const plainLine = [
        gig.title,
        gig.dates,
        [gig.venue, TICKETS].join(GIG_INFO_ITEMS_SEPARATOR),
      ].join(GIG_INFO_SEPARATOR);

      plainLines.push(plainLine);
    }
    const plainText = plainLines.join(GIGS_SEPARATOR);

    const htmlLines: string[] = [PREFIX];
    for (const gig of gigs) {
      const url = this.buildGigPermalink({
        baseUrl: appBaseUrl,
        publicId: gig.publicId,
        country: gig.country,
        city: gig.city,
      });

      const titleLabel = url ? `<a href="${url}">${gig.title}</a>` : gig.title;
      const ticketsLabel = `<a href="${gig.ticketsUrl}">${TICKETS}</a>`;

      const htmlLine = [
        titleLabel,
        gig.dates,
        [gig.venue, ticketsLabel].join(GIG_INFO_ITEMS_SEPARATOR),
      ].join(GIG_INFO_SEPARATOR);

      htmlLines.push(htmlLine);
    }

    const htmlText = htmlLines.join(GIGS_SEPARATOR);
    return { plain: plainText, html: htmlText };
  }

  composeWeeklyDigestCaption(gigs: readonly PlainGig[]): string {
    const { plain, html } = this.formatWeeklyDigestCaptionLines(gigs);

    if (plain.length <= TELEGRAM_MEDIA_CAPTION_MAX_CHARS) {
      return html;
    }

    let body = html;

    const ellipsis = '\n…';
    const budget = TELEGRAM_MEDIA_CAPTION_MAX_CHARS - ellipsis.length;
    if (budget <= 0) {
      return '…'.slice(0, TELEGRAM_MEDIA_CAPTION_MAX_CHARS);
    }

    body = body.slice(0, budget);
    const lastBreak = body.lastIndexOf('\n\n');
    if (lastBreak > budget * 0.5) {
      body = body.slice(0, lastBreak);
    }
    return `${body.trimEnd()}${ellipsis}`;
  }

  /**
   * Builds the Bot API payload for publishing the weekly digest to the main channel
   * (empty-week notice, media album, single photo, or plain text).
   */
  composeWeeklyDigest(
    params: ComposeWeeklyDigestParams,
  ): WeeklyDigestMainChannelSendPlan {
    const { chatId, gigs } = params;

    if (gigs.length === 0) {
      return {
        kind: WeeklyDigestMainChannelSendKind.SendMessage,
        payload: {
          chat_id: chatId,
          text: WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
        },
      };
    }

    const caption = this.composeWeeklyDigestCaption(gigs);

    const firstChunk = gigs.slice(0, TELEGRAM_MEDIA_GROUP_MAX_ITEMS);
    const posterRefs = firstChunk
      .map((gig) => this.getPosterReferenceForDigestAlbum(gig))
      .filter((ref): ref is string => ref !== undefined && ref !== '');

    if (posterRefs.length >= 2) {
      const media: TGInputMedia[] = posterRefs.map((mediaUrl, index) =>
        index === 0
          ? {
              type: TGInputMediaType.Photo,
              media: mediaUrl,
              caption,
              parse_mode: TGParseMode.HTML,
            }
          : {
              type: TGInputMediaType.Photo,
              media: mediaUrl,
            },
      );

      return {
        kind: WeeklyDigestMainChannelSendKind.SendMediaGroup,
        payload: {
          chat_id: chatId,
          media,
        },
      };
    }

    if (posterRefs.length === 1) {
      return {
        kind: WeeklyDigestMainChannelSendKind.SendPhoto,
        payload: {
          chat_id: chatId,
          photo: posterRefs[0],
          caption,
          parse_mode: TGParseMode.HTML,
        },
      };
    }

    return {
      kind: WeeklyDigestMainChannelSendKind.SendMessage,
      payload: {
        chat_id: chatId,
        text: caption,
        parse_mode: TGParseMode.HTML,
      },
    };
  }

  getPosterReferenceForDigestAlbum(gig: PlainGig): string | undefined {
    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    return moderationPost?.fileId ?? this.getPosterUrl(gig.poster);
  }

  private getPosterUrl(posterInfo?: GigPoster): string | undefined {
    if (!posterInfo) return;

    const { bucketPath, externalUrl } = posterInfo;
    if (bucketPath) {
      return this.bucketService.getPublicFileUrl(bucketPath) ?? externalUrl;
    }
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
    const poster = moderationPost?.fileId ?? this.getPosterUrl(gig.poster);

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

  composeModerationPost(gig: PlainGig): TGSendPhoto {
    const chatIdRaw = process.env.MODERATION_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      throw new BadRequestException(
        'Cannot compose moderation channel post: MODERATION_CHANNEL_ID is not configured.',
      );
    }

    const replyMarkup = this.buildModerationPostReplyMarkup(gig);

    const caption = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    const poster = this.getPosterUrl(gig.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose moderation channel post: gig has no poster URL.',
      );
    }

    return {
      chat_id: chatId,
      photo: poster,
      caption,
      reply_markup: replyMarkup,
    };
  }

  private buildModerationPostReplyMarkup(
    gig: PlainGig,
  ): TGInlineKeyboardMarkup {
    const editGigUrl = this.buildEditGigUrl(gig.publicId);

    return {
      inline_keyboard: [
        [
          {
            text: '✅ Approve',
            callback_data: `${Action.Approve}:${gig._id}`,
          },
          ...(editGigUrl ? [{ text: '✏️ Edit', url: editGigUrl }] : []),
          {
            text: '❌ Reject',
            callback_data: `${Action.Reject}:${gig._id}`,
          },
        ],
      ],
    };
  }

  buildEditGigUrl(publicId?: string): string | undefined {
    const editGigBaseUrl = (process.env.EDIT_GIG_URL ?? '').trim();
    return editGigBaseUrl && publicId
      ? `${editGigBaseUrl}?startapp=${encodeURIComponent(String(publicId))}`
      : undefined;
  }

  buildAfterPublishModerationReplyMarkup(
    params: BuildAfterPublishModerationReplyMarkupParams,
  ): TGInlineKeyboardMarkup | undefined {
    const { publishPostUrl, editGigUrl } = params;
    const row: { text: string; url: string }[] = [];

    if (publishPostUrl) {
      row.push({ text: '🔗 Post', url: publishPostUrl });
    }
    if (editGigUrl) {
      row.push({ text: '✏️ Edit', url: editGigUrl });
    }

    if (row.length === 0) {
      return undefined;
    }

    return { inline_keyboard: [row] };
  }

  buildRejectedModerationReplyMarkup(gigId: GigId): TGInlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '❌ Rejected',
            callback_data: `${Action.Rejected}:${String(gigId)}`,
          },
        ],
      ],
      // TODO: reason for rejection
      // force_reply: true,
      // input_field_placeholder: 'Reason?',
    };
  }

  buildSubmissionFeedbackPostLinkReplyMarkup(
    postUrl?: string,
  ): TGInlineKeyboardMarkup | undefined {
    if (!postUrl) {
      return undefined;
    }

    return {
      inline_keyboard: [[{ text: '🔗 Post', url: postUrl }]],
    };
  }

  composeSubmissionFeedbackPost(gig: PlainGig, chatId: TGChatId): TGSendPhoto {
    const statusForUser = 'Pending';

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: `⏳ ${statusForUser}`,
            callback_data: `${Action.Status}:${statusForUser}`,
          },
        ],
      ],
    };

    const caption = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster = moderationPost?.fileId ?? this.getPosterUrl(gig.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose submission feedback post: gig has no poster (moderation file_id or poster URL).',
      );
    }

    // TODO: add some language like "You've submitted, blablabla..."
    return {
      chat_id: chatId,
      photo: poster,
      caption,
      reply_markup: replyMarkup,
    };
  }

  buildGigPermalink(input: BuildGigPermalinkPayload): string | undefined {
    if (!input.baseUrl || !input.publicId || !input.country || !input.city) {
      return undefined;
    }

    const country = input.country.trim().toLowerCase();
    const city = input.city.trim().toLowerCase();

    // Current frontend routes:
    // - /feed/[country]/[city]
    // - gig anchor: #<publicId>
    const url = new URL(
      `/feed/${encodeURIComponent(country)}/${encodeURIComponent(city)}`,
      input.baseUrl,
    );
    url.hash = input.publicId;
    return url.toString();
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
