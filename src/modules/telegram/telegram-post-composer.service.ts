import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  TGEditMessageCaption,
  TGInputMedia,
  TGSendMessage,
  TGSendPhoto,
} from './types/message.types';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import { GigPost, GigPoster } from '../gig/gig.schema';
import type { PlainGig } from '../gig/types/gig.types';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import {
  CallbackScope,
  encodeCallbackData,
  GigCandidateCallbackAction,
  GigCallbackAction,
} from './callback-action';
import { PostType } from '../../shared/types/post-type.enum';
import { Messenger } from '../../shared/types/messenger.enum';
import type { TGInlineKeyboardMarkup } from './types/update.types';
import { BucketService } from '../bucket/bucket.service';
import { TELEGRAM_MEDIA_GROUP_MAX_ITEMS } from './telegram-bot.client';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { TelegramTemplateService } from './telegram-template.service';
import {
  BuildAfterPublishModerationReplyMarkupParams,
  BuildCaptionPayload,
  BuildGigCandidateCaptionParams,
  BuildGigPermalinkPayload,
  BuildModerationCaptionPayload,
  BuildModerationLinksParams,
  BuildPublishedModerationCaptionPayload,
  ComposedText,
  ComposeGigCandidateFeedbackMessageParams,
  ComposeGigCandidateIntakePostAfterModerationEditParams,
  ComposeRejectedGigCandidatePostEditParams,
  ComposeWeeklyDigestParams,
  GetPostUrlPayload,
  PostEditKind,
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

interface ComposeGigCandidateChannelPostParams {
  gigCandidate: GigCandidate;
  chatId: string;
  channelPurpose: 'intake' | 'moderation';
  replyMarkup: TGInlineKeyboardMarkup;
}

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

    const replyMarkup = this.buildAfterPublishModerationReplyMarkup({
      gigId: gig._id,
      expectedVersion: gig.version,
      isVisible: gig.isVisible,
      editGigUrl: this.buildEditGigUrl(gig.publicId),
    });
    const fullCaption = this.buildModerationCaption({
      body: this.buildGigBodyCaption(gig),
      adminGigUrl: this.buildAdminGigUrlByPublicId(gig.publicId),
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
    const post = this.pickTgPost(gig.posts, PostType.Main);
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

  composeGigCandidateIntakePost(gigCandidate: GigCandidate): TGSendPhoto {
    const chatId = this.requireChannelId(
      process.env.INTAKE_CHANNEL_ID,
      'INTAKE_CHANNEL_ID',
      'intake',
    );

    return this.composeGigCandidateChannelPost({
      gigCandidate,
      chatId,
      channelPurpose: 'intake',
      replyMarkup: this.buildGigCandidateIntakeReplyMarkup(gigCandidate),
    });
  }

  composeGigCandidateModerationPost(gigCandidate: GigCandidate): TGSendPhoto {
    const chatId = this.requireChannelId(
      process.env.MODERATION_CHANNEL_ID,
      'MODERATION_CHANNEL_ID',
      'moderation',
    );

    return this.composeGigCandidateChannelPost({
      gigCandidate,
      chatId,
      channelPurpose: 'moderation',
      replyMarkup: this.buildGigCandidateModerationReplyMarkup(gigCandidate),
    });
  }

  composeGigCandidateFeedbackMessage(
    params: ComposeGigCandidateFeedbackMessageParams,
  ): TGSendMessage {
    let text: string;
    switch (params.kind) {
      case 'submitted':
        text = this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackSubmitted,
          { title: this.escapeTelegramHtmlText(params.title) },
        );
        break;
      case 'acceptedForModeration':
        text = this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedForModeration,
          { title: this.escapeTelegramHtmlText(params.title) },
        );
        break;
      case 'rejected':
        text = this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackRejected,
          { title: this.escapeTelegramHtmlText(params.title) },
        );
        break;
      case 'acceptedWithPublicLink': {
        const gigUrl = this.buildGigPermalink({
          baseUrl: this.getAppBaseUrl(),
          publicId: params.publicId,
        });
        if (gigUrl === undefined) {
          throw new BadRequestException(
            'Cannot compose accepted GigCandidate feedback: APP_BASE_URL is not configured.',
          );
        }
        text = this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedWithPublicLink,
          {
            gigUrl,
            title: this.escapeTelegramHtmlText(params.title),
          },
        );
        break;
      }
    }

    return {
      chat_id: params.chatId,
      text,
      parse_mode: TGParseMode.HTML,
      disable_web_page_preview: params.kind === 'acceptedWithPublicLink',
    };
  }

  composeRejectedGigCandidatePostEdit(
    params: ComposeRejectedGigCandidatePostEditParams,
  ): TGEditMessageCaption {
    const channelPurpose =
      params.post.type === PostType.Intake ? 'intake' : 'moderation';

    return {
      chatId: params.post.chatId,
      messageId: params.post.id,
      caption: this.buildGigCandidateCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose,
      }),
      parseMode: TGParseMode.HTML,
      replyMarkup: { inline_keyboard: [] },
    };
  }

  composeGigCandidateIntakePostAfterModerationEdit(
    params: ComposeGigCandidateIntakePostAfterModerationEditParams,
  ): TGEditMessageCaption {
    return {
      chatId: params.intakePost.chatId,
      messageId: params.intakePost.id,
      caption: this.buildGigCandidateCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose: 'intake',
        moderationPost: params.moderationPost,
      }),
      parseMode: TGParseMode.HTML,
      replyMarkup: { inline_keyboard: [] },
    };
  }

  private composeGigCandidateChannelPost(
    params: ComposeGigCandidateChannelPostParams,
  ): TGSendPhoto {
    const poster = this.getPosterUrl(params.gigCandidate.gigDraft.poster);
    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        `Cannot compose GigCandidate ${params.channelPurpose} post: gigCandidate has no poster URL.`,
      );
    }

    return {
      chat_id: params.chatId,
      photo: poster,
      caption: this.buildGigCandidateCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose: params.channelPurpose,
      }),
      parse_mode: TGParseMode.HTML,
      reply_markup: params.replyMarkup,
    };
  }

  private buildGigCandidateCaption(
    params: BuildGigCandidateCaptionParams,
  ): string {
    const body = this.buildGigCandidateBodyCaption(params);
    const adminGigCandidateUrl = this.buildAdminGigCandidateUrl(
      params.gigCandidate.id,
    );
    if (adminGigCandidateUrl === undefined) {
      throw new BadRequestException(
        'Cannot compose GigCandidate channel post: APP_BASE_URL is not configured.',
      );
    }

    const links = [
      this.postTemplates.render(
        TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkOpenAdmin,
        { url: adminGigCandidateUrl },
      ),
    ];
    if (
      params.channelPurpose === 'intake' &&
      params.moderationPost !== undefined
    ) {
      const moderationPostUrl = this.getPostUrl({
        chatId: params.moderationPost.chatId,
        messageId: params.moderationPost.id,
      });
      if (moderationPostUrl === undefined) {
        throw new BadRequestException(
          'Cannot compose GigCandidate intake post: moderation post URL is unavailable.',
        );
      }
      links.push(
        this.postTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkSeeModerationPost,
          { url: moderationPostUrl },
        ),
      );
    }

    return `${body}\n${links.join(' | ')}`;
  }

  private buildGigCandidateBodyCaption(
    params: BuildGigCandidateCaptionParams,
  ): string {
    const { gigCandidate } = params;
    const { gigDraft, source } = gigCandidate;
    if (gigDraft.title === undefined || gigDraft.date === undefined) {
      throw new BadRequestException(
        'Cannot compose GigCandidate post: gigDraft title and date are required.',
      );
    }
    const locationLine = [gigDraft.country, gigDraft.city]
      .filter(Boolean)
      .join(' / ');

    const body = this.buildCaption({
      title: this.buildGigCandidateTitleLine(
        gigCandidate.status,
        gigDraft.title,
        params.channelPurpose,
      ),
      ticketsUrl: gigDraft.ticketsUrl ?? '',
      venue: gigDraft.venue ?? '',
      date: gigDraft.date,
      endDate: gigDraft.endDate,
    });
    const mainInformation = [body, locationLine].filter(Boolean).join('\n');

    return `${mainInformation}\n\n──────────\nSource: ${source.type}`;
  }

  private buildGigCandidateTitleLine(
    status: GigCandidateStatus,
    title: string,
    channelPurpose: 'intake' | 'moderation',
  ): string {
    const escapedTitle = this.escapeTelegramHtmlText(title);
    if (channelPurpose === 'intake') {
      return status === GigCandidateStatus.Rejected
        ? `🔴 ${escapedTitle}`
        : escapedTitle;
    }

    switch (status) {
      case GigCandidateStatus.New:
        return `⚪ ${escapedTitle}`;
      case GigCandidateStatus.Reviewing:
        return `🟡 ${escapedTitle}`;
      case GigCandidateStatus.Approved:
        return escapedTitle;
      case GigCandidateStatus.Rejected:
        return `🔴 ${escapedTitle}`;
    }
  }

  private escapeTelegramHtmlText(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private buildGigCandidateIntakeReplyMarkup(
    gigCandidate: GigCandidate,
  ): TGInlineKeyboardMarkup {
    const expectedVersionAfterPostStored = gigCandidate.version + 1;

    return {
      inline_keyboard: [
        [
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonSendToModeration,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.SendToModeration,
              id: gigCandidate.id,
              expectedVersion: expectedVersionAfterPostStored,
            }),
          },
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonReject,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.Reject,
              id: gigCandidate.id,
              expectedVersion: expectedVersionAfterPostStored,
            }),
          },
        ],
      ],
    };
  }

  private buildGigCandidateModerationReplyMarkup(
    gigCandidate: GigCandidate,
  ): TGInlineKeyboardMarkup {
    const expectedVersionAfterPostStored = gigCandidate.version + 1;
    const editGigCandidateUrl = this.buildAdminGigCandidateEditUrl(
      gigCandidate.id,
    );

    return {
      inline_keyboard: [
        [
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonApprove,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.Approve,
              id: gigCandidate.id,
              expectedVersion: expectedVersionAfterPostStored,
            }),
          },
          ...(editGigCandidateUrl
            ? [
                {
                  text: this.postTemplates.getText(
                    TELEGRAM_TEMPLATE_KEYS.buttonEdit,
                  ),
                  url: editGigCandidateUrl,
                },
              ]
            : []),
          {
            text: this.postTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonReject,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.Reject,
              id: gigCandidate.id,
              expectedVersion: expectedVersionAfterPostStored,
            }),
          },
        ],
      ],
    };
  }

  private buildAdminGigCandidateEditUrl(
    gigCandidateId: string,
  ): string | undefined {
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    if (!appBaseUrl) {
      return undefined;
    }

    return new URL(
      `/admin/gigs/candidates/${encodeURIComponent(gigCandidateId)}/edit`,
      appBaseUrl,
    ).toString();
  }

  private buildAdminGigCandidateUrl(
    gigCandidateId: string,
  ): string | undefined {
    const appBaseUrl = this.getAppBaseUrl();
    if (!appBaseUrl) {
      return undefined;
    }

    return new URL(
      `/admin/gigs/candidates/${encodeURIComponent(gigCandidateId)}`,
      appBaseUrl,
    ).toString();
  }

  private requireChannelId(
    chatIdRaw: string | undefined,
    envName: string,
    channelPurpose: 'intake' | 'moderation',
  ): string {
    const chatId = chatIdRaw?.trim() ?? '';
    if (!chatId) {
      throw new BadRequestException(
        `Cannot compose GigCandidate ${channelPurpose} post: ${envName} is not configured.`,
      );
    }

    return chatId;
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
    const { gigId, expectedVersion, isVisible, publishPostUrl, editGigUrl } =
      params;

    const row: Array<
      { text: string; url: string } | { text: string; callback_data: string }
    > = [];

    if (!publishPostUrl && gigId !== undefined) {
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

    const actionLinks = [
      payload.adminGigUrl
        ? this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigLinkOpenAdmin, {
            url: payload.adminGigUrl,
          })
        : undefined,
      payload.publishPostUrl
        ? this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigLinkSeeMainPost, {
            url: payload.publishPostUrl,
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
    const statusLine = this.buildModerationLinks({
      publishPostUrl: payload.publishPostUrl,
      adminGigUrl: payload.adminGigUrl,
    });

    if (statusLine === '') {
      return payload.body;
    }

    return this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.moderationGig, {
      statusLine,
      body: payload.body,
    });
  }

  private buildModerationLinks(params: BuildModerationLinksParams): string {
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
      return '';
    }
    return statusLinks.join(' | ');
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
