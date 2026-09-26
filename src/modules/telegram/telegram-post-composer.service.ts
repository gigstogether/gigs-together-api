import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  TGChatId,
  TGInlineKeyboardMarkup,
  TGInputMedia,
  TGSendMessage,
  TGSendPhoto,
} from './types/message.types';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import type { GigPost, GigPoster } from '../gig/types/gig.types';
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
import { BucketService } from '../bucket/bucket.service';
import { TELEGRAM_MEDIA_GROUP_MAX_ITEMS } from './telegram-bot.client';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { TelegramTemplateService } from './telegram-template.service';
import type {
  BuildGigModerationReplyMarkupParams,
  BuildCaptionPayload,
  BuildGigCandidateCaptionParams,
  BuildGigPermalinkPayload,
  BuildGigModerationCaptionPayload,
  ComposedText,
  ComposeGigCandidateFeedbackMessageParams,
  ComposeGigCandidateIntakePostAfterModerationEditParams,
  ComposeGigCandidatePostEditParams,
  ComposeGigPostEditParams,
  ComposeRejectedGigCandidatePostEditParams,
  ComposeWeeklyDigestParams,
  GetPostUrlPayload,
  TelegramPostEditComposition,
  WeeklyDigestMainChannelSendPlan,
} from './types/telegram-post-composer.service.types';
import {
  PostEditKind,
  WeeklyDigestMainChannelSendKind,
} from './types/telegram-post-composer.service.types';

export const TELEGRAM_MEDIA_CAPTION_MAX_CHARS = 1024;

export enum TelegramMiniAppStartAction {
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

const WEEKLY_DIGEST_GIGS_SEPARATOR = '\n\n';
const TELEGRAM_MINI_APP_START_ACTION_SEPARATOR = '-';
const SUGGEST_GIG_PATH = '/suggest/launch';

interface ComposeGigCandidateChannelPostParams {
  gigCandidate: GigCandidate;
  chatId: string;
  channelPurpose: 'intake' | 'moderation';
  replyMarkup: TGInlineKeyboardMarkup;
}

interface BuildGigCandidateModerationReplyMarkupParams {
  gigCandidate: GigCandidate;
  expectedVersion: number;
}

interface ComposeGigCandidateExistingPostEditParams {
  post: GigCandidate['posts'][number];
  text: string;
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
        ? this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.gigTitleWithLink, {
            url,
            title: gig.title,
          })
        : this.postTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.gigTitleWithoutLink,
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
   * Builds the Bot API payload for sending the weekly digest to the main channel
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
    const digestMediaItems = firstChunk.flatMap((gig) => {
      const mediaReference = this.getDigestMediaReference(gig);
      if (mediaReference === undefined || mediaReference === '') {
        return [];
      }
      return [{ mediaReference, publicId: gig.publicId }];
    });

    if (digestMediaItems.length >= 2) {
      const media: TGInputMedia[] = digestMediaItems.map((item, index) =>
        index === 0
          ? {
              type: TGInputMediaType.Photo,
              media: item.mediaReference,
              caption,
              parse_mode: TGParseMode.HTML,
            }
          : {
              type: TGInputMediaType.Photo,
              media: item.mediaReference,
            },
      );

      return {
        kind: WeeklyDigestMainChannelSendKind.SendMediaGroup,
        payload: {
          chat_id: chatId,
          media,
        },
        mediaItems: digestMediaItems.map((item, index) => ({
          position: index + 1,
          publicId: item.publicId,
        })),
      };
    }

    if (digestMediaItems.length === 1) {
      return {
        kind: WeeklyDigestMainChannelSendKind.SendPhoto,
        payload: {
          chat_id: chatId,
          photo: digestMediaItems[0].mediaReference,
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

  getDigestMediaReference(gig: PlainGig): string | undefined {
    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    return moderationPost?.fileId ?? this.getTelegramPosterUrl(gig.poster);
  }

  private getTelegramPosterUrl(posterInfo?: GigPoster): string | undefined {
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

  composeGigCandidateIntakePost(
    gigCandidate: GigCandidate,
  ): TGSendMessage | TGSendPhoto {
    const chatId = this.requireChannelId(
      process.env.INTAKE_CHANNEL_ID,
      'INTAKE_CHANNEL_ID',
      'intake',
    );

    const replyMarkup = this.buildGigCandidateIntakeReplyMarkup(gigCandidate);
    const poster = this.getTelegramPosterUrl(gigCandidate.gigDraft.poster);
    if (poster === undefined || poster === '') {
      return {
        chat_id: chatId,
        text: this.buildGigCandidateCaption({
          gigCandidate,
          channelPurpose: 'intake',
        }),
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      };
    }

    return this.composeGigCandidateChannelPost({
      gigCandidate,
      chatId,
      channelPurpose: 'intake',
      replyMarkup,
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
      replyMarkup: this.buildGigCandidateModerationReplyMarkup({
        gigCandidate,
        expectedVersion: gigCandidate.version + 1,
      }),
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

  composeIncomingMessageUnavailable(chatId: TGChatId): TGSendMessage {
    return {
      chat_id: chatId,
      text: this.postTemplates.getText(
        TELEGRAM_TEMPLATE_KEYS.incomingMessageUnavailable,
      ),
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: this.postTemplates.getText(
                TELEGRAM_TEMPLATE_KEYS.buttonContactAdmins,
              ),
              url: this.postTemplates.getText(
                TELEGRAM_TEMPLATE_KEYS.linkContactAdmins,
              ),
            },
          ],
        ],
      },
    };
  }

  composeStartCommandResponse(chatId: TGChatId): TGSendMessage {
    const contactAdminsUrl = this.postTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.linkContactAdmins,
    );

    return {
      chat_id: chatId,
      text: this.postTemplates.render(TELEGRAM_TEMPLATE_KEYS.commandStart, {
        contactAdminsUrl: this.escapeTelegramHtmlAttribute(contactAdminsUrl),
      }),
      parse_mode: TGParseMode.HTML,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: this.postTemplates.getText(
                TELEGRAM_TEMPLATE_KEYS.buttonSuggestGig,
              ),
              url: this.buildSuggestGigUrl(),
            },
          ],
        ],
      },
    };
  }

  composeUnknownCommandResponse(chatId: TGChatId): TGSendMessage {
    return {
      chat_id: chatId,
      text: this.postTemplates.getText(TELEGRAM_TEMPLATE_KEYS.commandUnknown),
    };
  }

  composeRejectedGigCandidatePostEdit(
    params: ComposeRejectedGigCandidatePostEditParams,
  ): TelegramPostEditComposition {
    const channelPurpose =
      params.post.type === PostType.Intake ? 'intake' : 'moderation';

    return this.composeGigCandidateExistingPostEdit({
      post: params.post,
      text: this.buildGigCandidateCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose,
      }),
      replyMarkup: { inline_keyboard: [] },
    });
  }

  composeGigCandidateIntakePostAfterModerationEdit(
    params: ComposeGigCandidateIntakePostAfterModerationEditParams,
  ): TelegramPostEditComposition {
    return this.composeGigCandidateExistingPostEdit({
      post: params.intakePost,
      text: this.buildGigCandidateCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose: 'intake',
        moderationPost: params.moderationPost,
      }),
      replyMarkup: { inline_keyboard: [] },
    });
  }

  composeGigCandidatePostEdit(
    params: ComposeGigCandidatePostEditParams,
  ): TelegramPostEditComposition {
    if (params.post.to !== Messenger.Telegram) {
      throw new BadRequestException(
        'Cannot edit a non-Telegram GigCandidate post',
      );
    }
    if (params.post.type !== PostType.Moderation) {
      throw new BadRequestException(
        `Cannot edit a ${params.post.type} post for a GigCandidate`,
      );
    }
    return this.composeGigCandidateModerationPostEdit(params);
  }

  private composeGigCandidateModerationPostEdit(
    params: ComposeGigCandidatePostEditParams,
  ): TelegramPostEditComposition {
    const caption = this.buildGigCandidateCaption({
      gigCandidate: params.gigCandidate,
      channelPurpose: 'moderation',
    });
    const replyMarkup = this.buildGigCandidateModerationReplyMarkup({
      gigCandidate: params.gigCandidate,
      expectedVersion: params.gigCandidate.version,
    });

    if (params.isMediaUpdateRequired) {
      const posterUrl = this.getTelegramPosterUrl(
        params.gigCandidate.gigDraft.poster,
      );
      if (posterUrl === undefined || posterUrl === '') {
        throw new BadRequestException(
          'Cannot update GigCandidate moderation post media: gigCandidate has no poster URL.',
        );
      }
      return {
        kind: PostEditKind.Media,
        payload: {
          chatId: params.post.chatId,
          messageId: params.post.id,
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

    return {
      kind: PostEditKind.Caption,
      payload: {
        chatId: params.post.chatId,
        messageId: params.post.id,
        caption,
        parseMode: TGParseMode.HTML,
        replyMarkup,
      },
    };
  }

  private composeGigCandidateChannelPost(
    params: ComposeGigCandidateChannelPostParams,
  ): TGSendPhoto {
    const poster = this.getTelegramPosterUrl(
      params.gigCandidate.gigDraft.poster,
    );
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

  private composeGigCandidateExistingPostEdit(
    params: ComposeGigCandidateExistingPostEditParams,
  ): TelegramPostEditComposition {
    if (params.post.fileId === undefined) {
      return {
        kind: PostEditKind.Text,
        payload: {
          chatId: params.post.chatId,
          messageId: params.post.id,
          text: params.text,
          parseMode: TGParseMode.HTML,
          disableWebPagePreview: true,
          replyMarkup: params.replyMarkup,
        },
      };
    }

    return {
      kind: PostEditKind.Caption,
      payload: {
        chatId: params.post.chatId,
        messageId: params.post.id,
        caption: params.text,
        parseMode: TGParseMode.HTML,
        replyMarkup: params.replyMarkup,
      },
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
        'Cannot compose GigCandidate channel post: EDIT_GIG_URL is not configured.',
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
    return `${body}\n\n──────────\nSource: ${source.type}`;
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

  private escapeTelegramHtmlAttribute(value: string): string {
    return this.escapeTelegramHtmlText(value).replaceAll('"', '&quot;');
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
    params: BuildGigCandidateModerationReplyMarkupParams,
  ): TGInlineKeyboardMarkup {
    const { gigCandidate, expectedVersion } = params;
    const editGigCandidateUrl = this.buildEditGigCandidateUrl(gigCandidate.id);

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
              expectedVersion,
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
              expectedVersion,
            }),
          },
        ],
      ],
    };
  }

  private buildEditGigCandidateUrl(gigCandidateId: string): string | undefined {
    return this.buildTelegramMiniAppUrl(
      TelegramMiniAppStartAction.EditGigCandidate,
      gigCandidateId,
    );
  }

  private buildAdminGigCandidateUrl(
    gigCandidateId: string,
  ): string | undefined {
    return this.buildTelegramMiniAppUrl(
      TelegramMiniAppStartAction.OpenGigCandidate,
      gigCandidateId,
    );
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
    return publicId
      ? this.buildTelegramMiniAppUrl(
          TelegramMiniAppStartAction.EditGig,
          publicId,
        )
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
      ? this.buildTelegramMiniAppUrl(
          TelegramMiniAppStartAction.OpenGig,
          publicId,
        )
      : undefined;
  }

  private buildTelegramMiniAppUrl(
    action: TelegramMiniAppStartAction,
    resourceId: string,
  ): string | undefined {
    const miniAppBaseUrl = (process.env.EDIT_GIG_URL ?? '').trim();
    return miniAppBaseUrl
      ? `${miniAppBaseUrl}?startapp=${encodeURIComponent(`${action}${TELEGRAM_MINI_APP_START_ACTION_SEPARATOR}${resourceId}`)}`
      : undefined;
  }

  private getAppBaseUrl(): string {
    return (process.env.APP_BASE_URL ?? '').trim();
  }

  private buildSuggestGigUrl(): string {
    const appBaseUrl = this.getAppBaseUrl();
    if (appBaseUrl === '') {
      throw new BadRequestException(
        'Cannot compose start command response: APP_BASE_URL is not configured.',
      );
    }

    return new URL(SUGGEST_GIG_PATH, appBaseUrl).toString();
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
