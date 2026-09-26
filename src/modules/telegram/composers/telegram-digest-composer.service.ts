import { Injectable } from '@nestjs/common';
import type { PlainGig } from '../../gig/types/gig.types';
import { PostType } from '../../../shared/types/post-type.enum';
import { TELEGRAM_MEDIA_GROUP_MAX_ITEMS } from '../telegram-bot.client';
import { TelegramPostComposerService } from '../telegram-post-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import type { TGInputMedia } from '../types/message.types';
import { TGInputMediaType, TGParseMode } from '../types/message.types';
import type {
  ComposeWeeklyDigestParams,
  WeeklyDigestSendPlan,
} from './telegram-digest-composer.types';
import { WeeklyDigestSendKind } from './telegram-digest-composer.types';

export const TELEGRAM_DIGEST_CAPTION_MAX_CHARS = 1024;

const DATE_LOCALE = 'en-GB';
const WEEKLY_DIGEST_GIGS_SEPARATOR = '\n\n';

interface ComposedDigestText {
  plain: string;
  html: string;
}

@Injectable()
export class TelegramDigestComposerService {
  constructor(
    private readonly telegramTemplates: TelegramTemplateService,
    private readonly telegramPostComposer: TelegramPostComposerService,
  ) {}

  composeWeeklyDigest(params: ComposeWeeklyDigestParams): WeeklyDigestSendPlan {
    const { chatId, gigs } = params;

    if (gigs.length === 0) {
      return {
        kind: WeeklyDigestSendKind.SendMessage,
        payload: {
          chat_id: chatId,
          text: this.telegramTemplates.getText(
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
        kind: WeeklyDigestSendKind.SendMediaGroup,
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
        kind: WeeklyDigestSendKind.SendPhoto,
        payload: {
          chat_id: chatId,
          photo: digestMediaItems[0].mediaReference,
          caption,
          parse_mode: TGParseMode.HTML,
        },
      };
    }

    return {
      kind: WeeklyDigestSendKind.SendMessage,
      payload: {
        chat_id: chatId,
        text: caption,
        parse_mode: TGParseMode.HTML,
      },
    };
  }

  private composeWeeklyDigestCaption(gigs: PlainGig[]): string {
    const { plain, html } = this.composeWeeklyDigestText(gigs);

    if (plain.length <= TELEGRAM_DIGEST_CAPTION_MAX_CHARS) {
      return html;
    }

    const ellipsis = '\n…';
    const budget = TELEGRAM_DIGEST_CAPTION_MAX_CHARS - ellipsis.length;
    if (budget <= 0) {
      return '…'.slice(0, TELEGRAM_DIGEST_CAPTION_MAX_CHARS);
    }

    let body = html.slice(0, budget);
    const lastBreak = body.lastIndexOf(WEEKLY_DIGEST_GIGS_SEPARATOR);
    if (lastBreak > budget * 0.5) {
      body = body.slice(0, lastBreak);
    }
    return `${body.trimEnd()}${ellipsis}`;
  }

  private composeWeeklyDigestText(gigs: PlainGig[]): ComposedDigestText {
    const formatter = new Intl.DateTimeFormat(DATE_LOCALE, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    // TODO
    const header = this.telegramTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.weeklyDigestHeader,
    );
    const footer = this.telegramTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.weeklyDigestFooter,
    );
    const ticketsLabel = this.telegramTemplates.getText(
      TELEGRAM_TEMPLATE_KEYS.weeklyDigestTicketsLabel,
    );

    const formattedGigs = gigs.map((gig) => {
      const dateLabel = formatter.format(new Date(gig.date));
      const endDateLabel = gig.endDate
        ? formatter.format(new Date(gig.endDate))
        : undefined;
      const datesLabel = `${dateLabel}${endDateLabel ? ` — ${endDateLabel}` : ''}`;
      const url = this.telegramPostComposer.buildGigPermalink({
        baseUrl: appBaseUrl,
        publicId: gig.publicId,
      });

      const titleLine = url
        ? this.telegramTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.gigTitleWithLink,
            { url, title: gig.title },
          )
        : this.telegramTemplates.render(
            TELEGRAM_TEMPLATE_KEYS.gigTitleWithoutLink,
            { title: gig.title },
          );
      const ticketsLine = this.telegramTemplates.render(
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

    const plainLines = [header];
    const htmlLines = [header];
    for (const gig of formattedGigs) {
      plainLines.push(
        this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.weeklyDigestGigLinePlain,
          gig,
        ),
      );
      htmlLines.push(
        this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.weeklyDigestGigLineHtml,
          gig,
        ),
      );
    }
    plainLines.push(footer);
    htmlLines.push(footer);

    return {
      plain: plainLines.join(WEEKLY_DIGEST_GIGS_SEPARATOR),
      html: htmlLines.join(WEEKLY_DIGEST_GIGS_SEPARATOR),
    };
  }

  private getDigestMediaReference(gig: PlainGig): string | undefined {
    const moderationPost = this.telegramPostComposer.pickTgPost(
      gig.posts,
      PostType.Moderation,
    );
    return (
      moderationPost?.fileId ??
      this.telegramPostComposer.getTelegramPosterUrl(gig.poster)
    );
  }
}
