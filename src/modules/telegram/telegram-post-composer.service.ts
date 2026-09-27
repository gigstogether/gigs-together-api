import { Injectable } from '@nestjs/common';
import { BucketService } from '../bucket/bucket.service';
import type { GigPoster } from '../gig/types/gig.types';
import { TELEGRAM_TEMPLATE_KEYS } from './telegram-template-keys';
import { TelegramTemplateService } from './telegram-template.service';
import type {
  BuildCaptionPayload,
  BuildGigPermalinkPayload,
  GetPostUrlPayload,
} from './telegram-post-composer.service.types';

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

@Injectable()
export class TelegramPostComposerService {
  constructor(
    private readonly bucketService: BucketService,
    private readonly postTemplates: TelegramTemplateService,
  ) {}

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

  buildGigPermalink(input: BuildGigPermalinkPayload): string | undefined {
    if (!input.baseUrl || !input.publicId) {
      return undefined;
    }

    return new URL(
      `/gigs/${encodeURIComponent(input.publicId)}`,
      input.baseUrl,
    ).toString();
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

  private addTelegramCacheBustToUrl(url: string): string {
    const cacheBustedUrl = new URL(url);
    cacheBustedUrl.searchParams.set('tgcb', String(Date.now()));
    return cacheBustedUrl.toString();
  }
}
