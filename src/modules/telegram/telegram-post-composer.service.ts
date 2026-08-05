import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  TGSendPhoto,
  TGChatId,
  TGInputMedia,
} from './types/message.types';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import { GigPost, GigPoster } from '../gig/gig.schema';
import type { PlainGig } from '../gig/types/gig.types';
import type { GigCandidateRecord } from '../gig-candidate/types/gig-candidate.types';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import { Status } from '../gig/types/status.enum';
import { Action } from './types/action.enum';
import { PostType } from '../gig/types/postType.enum';
import { Messenger } from '../gig/types/messenger.enum';
import type { TGInlineKeyboardMarkup } from './types/update.types';
import { BucketService } from '../bucket/bucket.service';
import { TELEGRAM_MEDIA_GROUP_MAX_ITEMS } from './telegram-bot.client';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { TelegramTemplateService } from './telegram-template.service';
import {
  BuildAfterPublishModerationReplyMarkupParams,
  BuildCaptionPayload,
  BuildGigCandidateCaptionParams,
  BuildModerationCaptionPayload,
  BuildModerationStatusLinePayload,
  BuildGigPermalinkPayload,
  BuildPublishedModerationCaptionPayload,
  BuildRejectedModerationCaptionPayload,
  BuildSubmissionFeedbackCaptionPayload,
  ComposedText,
  ComposeGigCandidatePostEditParams,
  ComposeWeeklyDigestParams,
  GetPostUrlPayload,
  PostEditKind,
  SubmissionFeedbackStatus,
  TelegramGigPostEditComposition,
  WeeklyDigestMainChannelSendKind,
  WeeklyDigestMainChannelSendPlan,
} from './types/telegram-post-composer.service.types';

export const TELEGRAM_MEDIA_CAPTION_MAX_CHARS = 1024;

const DATE_LOCALE = 'en-GB';
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  weekday: 'short',
};

const WEEKLY_DIGEST_GIGS_SEPARATOR = '\n\n';

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

    const editGigUrl = this.buildEditGigUrl(gig.publicId);
    const adminGigUrl = this.buildAdminGigUrlByPublicId(gig.publicId);
    const isRejected = gig.status === Status.Rejected;
    const replyMarkup = isRejected
      ? this.buildRejectedModerationReplyMarkup(editGigUrl)
      : this.buildModerationPostReplyMarkup(gig);

    const fullCaption = this.buildModerationCaption({
      body: this.buildGigBodyCaption(gig),
      status: isRejected ? Status.Rejected : Status.Pending,
      adminGigUrl,
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
              caption: fullCaption,
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

  formatWeeklyDigestCaptionLines(gigDocs: readonly PlainGig[]): ComposedText {
    const formatter = new Intl.DateTimeFormat(DATE_LOCALE, {
      weekday: DATE_FORMAT.weekday,
      month: DATE_FORMAT.month,
      day: DATE_FORMAT.day,
    });

    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    // TODO
    const header = this.postTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.weeklyDigestHeader,
    );
    const footer = this.postTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.weeklyDigestFooter,
    );
    const ticketsLabel = this.postTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.weeklyDigestTicketsLabel,
    );

    const gigs = gigDocs.map((gig: PlainGig) => {
      const dateLabel = formatter.format(new Date(gig.date));
      const endDateLabel = gig.endDate
        ? formatter.format(new Date(gig.endDate))
        : undefined;
      const datesLabel = `${dateLabel}${endDateLabel ? ` — ${endDateLabel}` : ''}`;
      const url = this.buildGigPermalink({
        baseUrl: appBaseUrl,
        publicId: gig.publicId,
      });

      const titleLine = url
        ? this.postTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithLink,
            { url, title: gig.title },
          )
        : this.postTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithoutLink,
            { title: gig.title },
          );
      const ticketsLine = this.postTemplates.render(
        TELEGRAM_TEMPLATE_KEYS.weeklyDigestTicketsLink,
        { url: gig.ticketsUrl, ticketsLabel },
      );

      return {
        dates: datesLabel,
        title: gig.title,
        venue: gig.venue,
        ticketsLabel,
        titleLine,
        ticketsLine,
      };
    });

    const plainLines: string[] = [header];
    for (const gig of gigs) {
      plainLines.push(
        this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.weeklyDigestGigLinePlain,
          gig,
        ),
      );
    }
    plainLines.push(footer);
    const plainText = plainLines.join(WEEKLY_DIGEST_GIGS_SEPARATOR);

    const htmlLines: string[] = [header];
    for (const gig of gigs) {
      htmlLines.push(
        this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.weeklyDigestGigLineHtml,
          gig,
        ),
      );
    }
    htmlLines.push(footer);
    const htmlText = htmlLines.join(WEEKLY_DIGEST_GIGS_SEPARATOR);
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
          text: this.postTemplates.getText(
            TELEGRAM_TEMPLATE_KEYS.weeklyDigestEmpty,
          ),
          // TODO: read parse_mode from translations
          parse_mode: TGParseMode.HTML,
          disable_web_page_preview: true,
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
    const fullCaption = this.buildModerationCaption({
      body: this.buildGigBodyCaption(gig),
      status: Status.Pending,
      adminGigUrl: this.buildAdminGigUrlByPublicId(gig.publicId),
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
      caption: fullCaption,
      parse_mode: TGParseMode.HTML,
      reply_markup: replyMarkup,
    };
  }

  composeGigCandidatePost(gigCandidate: GigCandidateRecord): TGSendPhoto {
    const chatIdRaw = process.env.GIG_CANDIDATE_MODERATION_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      throw new BadRequestException(
        'Cannot compose gig-candidate suggestion post: GIG_CANDIDATE_MODERATION_CHANNEL_ID is not configured.',
      );
    }

    const replyMarkup = this.buildGigCandidateReplyMarkup(gigCandidate);
    const fullCaption = this.buildGigCandidateCaption({
      gigCandidate,
      status: GigCandidateStatus.Pending,
    });

    const poster = this.getPosterUrl(gigCandidate.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose gig-candidate suggestion post: user gig has no poster URL.',
      );
    }

    return {
      chat_id: chatId,
      photo: poster,
      caption: fullCaption,
      parse_mode: TGParseMode.HTML,
      reply_markup: replyMarkup,
    };
  }

  composeGigCandidatePostEdit(
    params: ComposeGigCandidatePostEditParams,
  ): TelegramGigPostEditComposition {
    const { gigCandidate, chatId, messageId, fileId } = params;
    const fullCaption = this.buildGigCandidateCaption({
      gigCandidate,
      status: gigCandidate.status,
    });
    const replyMarkup: TGInlineKeyboardMarkup = { inline_keyboard: [] };

    if (fileId) {
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

  private buildGigCandidateReplyMarkup(
    gigCandidate: GigCandidateRecord,
  ): TGInlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonAccept,
            ),
            callback_data: `${Action.AcceptCandidate}:${gigCandidate.id}`,
          },
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonReject,
            ),
            callback_data: `${Action.RejectCandidate}:${gigCandidate.id}`,
          },
        ],
      ],
    };
  }

  private buildGigCandidateCaption(
    params: BuildGigCandidateCaptionParams,
  ): string {
    const { gigCandidate, status } = params;
    const statusLabel = this.buildGigCandidateStatusLabel(status);
    const body = this.buildGigCandidateBodyCaption(gigCandidate);

    return this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigCandidate, {
      statusLine: statusLabel,
      body,
    });
  }

  private buildGigCandidateBodyCaption(
    gigCandidate: GigCandidateRecord,
  ): string {
    const suggestedBy = gigCandidate.suggestedBy;
    const suggestedByLabel = [
      suggestedBy.name,
      suggestedBy.username ? `@${suggestedBy.username}` : undefined,
      `id:${suggestedBy.userId}`,
    ]
      .filter(Boolean)
      .join(' ');

    const locationLine = [gigCandidate.country, gigCandidate.city]
      .filter(Boolean)
      .join(' / ');

    const body = this.buildCaption({
      title: gigCandidate.title,
      ticketsUrl: gigCandidate.ticketsUrl ?? '',
      venue: gigCandidate.venue ?? '',
      date: gigCandidate.date,
      endDate: gigCandidate.endDate,
    });

    return `${body}\n${locationLine}\nSuggested by: ${suggestedByLabel}`;
  }

  private buildGigCandidateStatusLabel(status: GigCandidateStatus): string {
    switch (status) {
      case GigCandidateStatus.Pending:
        return this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.statusPending);
      case GigCandidateStatus.Rejected:
        return this.postTemplates.getText(
          TELEGRAM_TEMPLATE_KEYS.statusRejected,
        );
      case GigCandidateStatus.Accepted:
        return this.postTemplates.getText(
          TELEGRAM_TEMPLATE_KEYS.statusAccepted,
        );
    }
  }

  private buildModerationPostReplyMarkup(
    gig: PlainGig,
  ): TGInlineKeyboardMarkup {
    const editGigUrl = this.buildEditGigUrl(gig.publicId);

    return {
      inline_keyboard: [
        [
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonApprove,
            ),
            callback_data: `${Action.Approve}:${gig._id}`,
          },
          ...(editGigUrl
            ? [
                {
                  text: this.postTemplates.getText(
                    TELEGRAM_TEMPLATE_KEYS.buttonEdit,
                  ),
                  url: editGigUrl,
                },
              ]
            : []),
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonReject,
            ),
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
    const { gigId, publishPostUrl, editGigUrl } = params;

    const row: Array<
      { text: string; url: string } | { text: string; callback_data: string }
    > = [];

    if (!publishPostUrl && gigId !== undefined) {
      row.push({
        text: this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.buttonPost),
        callback_data: `${Action.Post}:${String(gigId)}`,
      });
    }
    if (editGigUrl) {
      row.push({
        text: this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.buttonEdit),
        url: editGigUrl,
      });
    }

    if (row.length === 0) {
      return undefined;
    }

    return { inline_keyboard: [row] };
  }

  buildPublishedModerationCaption(
    payload: BuildPublishedModerationCaptionPayload,
  ): string {
    const titleLabel = payload.gigUrl
      ? this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithLink,
          { url: payload.gigUrl, title: payload.title },
        )
      : this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.publishedModerationTitleWithoutLink,
          { title: payload.title },
        );

    return this.buildModerationCaption({
      body: titleLabel,
      status: Status.Published,
      publishPostUrl: payload.publishPostUrl,
      adminGigUrl: payload.adminGigUrl,
    });
  }

  buildSubmissionFeedbackCaption(
    payload: BuildSubmissionFeedbackCaptionPayload,
  ): string {
    const statusLabel = this.buildStatusLabel(payload.status);

    return this.postTemplates.render(
      TELEGRAM_TEMPLATE_KEYS.submissionFeedback,
      {
        statusLabel,
        body: payload.body,
      },
    );
  }

  buildRejectedModerationCaption(
    payload: BuildRejectedModerationCaptionPayload,
  ): string {
    return this.buildModerationCaption({
      body: payload.body,
      status: Status.Rejected,
      adminGigUrl: payload.adminGigUrl,
    });
  }

  buildRejectedModerationReplyMarkup(
    editGigUrl?: string,
  ): TGInlineKeyboardMarkup | undefined {
    if (!editGigUrl) {
      return undefined;
    }

    return {
      inline_keyboard: [
        [
          {
            text: this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.buttonEdit),
            url: editGigUrl,
          },
        ],
      ],
    };
  }

  composeSubmissionFeedbackPost(gig: PlainGig, chatId: TGChatId): TGSendPhoto {
    const body = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });
    const caption = this.buildSubmissionFeedbackCaption({
      body,
      status: Status.Pending,
    });

    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster = moderationPost?.fileId ?? this.getPosterUrl(gig.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose submission feedback post: gig has no poster (moderation file_id or poster URL).',
      );
    }

    // TODO: add some text like "You've submitted, blablabla..."
    return {
      chat_id: chatId,
      photo: poster,
      caption,
      parse_mode: TGParseMode.HTML,
    };
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

  buildAdminGigUrl(input: BuildGigPermalinkPayload): string | undefined {
    if (!input.baseUrl || !input.publicId) {
      return undefined;
    }

    return new URL(
      `/admin/gigs/${encodeURIComponent(input.publicId)}`,
      input.baseUrl,
    ).toString();
  }

  private buildModerationCaption(
    payload: BuildModerationCaptionPayload,
  ): string {
    const statusLine = this.buildModerationStatusLine({
      status: payload.status,
      publishPostUrl: payload.publishPostUrl,
      adminGigUrl: payload.adminGigUrl,
    });

    return this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.moderationGig, {
      statusLine,
      body: payload.body,
    });
  }

  private buildModerationStatusLine(
    params: BuildModerationStatusLinePayload,
  ): string {
    const statusLabel = this.buildStatusLabel(params.status);
    const statusLinks = [
      params.publishPostUrl
        ? this.postTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.moderationLinkSeePost,
            { url: params.publishPostUrl },
          )
        : undefined,
      params.adminGigUrl
        ? this.postTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.moderationLinkOpenAdmin,
            { url: params.adminGigUrl },
          )
        : undefined,
    ].filter(Boolean);

    if (statusLinks.length === 0) {
      return statusLabel;
    }

    return this.postTemplates.render(
      TELEGRAM_TEMPLATE_KEYS.moderationStatusLineWithLinks,
      {
        statusLabel,
        statusLinks: statusLinks.join(' | '),
      },
    );
  }

  private buildAdminGigUrlByPublicId(publicId?: string): string | undefined {
    if (!publicId) {
      return undefined;
    }

    return this.buildAdminGigUrl({
      baseUrl: this.getAppBaseUrl(),
      publicId,
    });
  }

  private buildGigBodyCaption(gig: PlainGig): string {
    return this.buildCaption({
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

  private buildStatusLabel(status: SubmissionFeedbackStatus): string {
    switch (status) {
      case Status.Pending:
        return this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.statusPending);
      case Status.Published:
        return this.postTemplates.getText(
          TELEGRAM_TEMPLATE_KEYS.statusPublished,
        );
      case Status.Rejected:
        return this.postTemplates.getText(
          TELEGRAM_TEMPLATE_KEYS.statusRejected,
        );
    }
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
