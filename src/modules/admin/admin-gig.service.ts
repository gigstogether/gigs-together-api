import { Injectable } from '@nestjs/common';
import type { GigDocument } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { Status } from '../gig/types/status.enum';
import { msToYmd } from '../../shared/utils/date-formatter';
import {
  ADMIN_GIG_LIST_DEFAULT_LIMIT,
  ADMIN_GIG_LIST_DEFAULT_SORT_BY,
  ADMIN_GIG_LIST_DEFAULT_SORT_ORDER,
} from '../gig/types/admin-gig-list-sort.types';
import type {
  AdminGigListStatusQuery,
  V1AdminGigsGetQueryDto,
} from './types/requests/v1-admin-gigs-get-query';
import type {
  V1AdminGigListItem,
  V1AdminGigsListResponseBody,
} from './types/requests/v1-admin-gigs-list-response';

const STATUS_BY_QUERY: Record<AdminGigListStatusQuery, Status> = {
  pending: Status.Pending,
  published: Status.Published,
  rejected: Status.Rejected,
};

interface MapGigToListItemParams {
  readonly gig: GigDocument;
  readonly posterUrl?: string;
  readonly postUrl?: string;
}

@Injectable()
export class AdminGigService {
  constructor(private readonly gigService: GigService) {}

  async getGigsList(
    query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    const status = STATUS_BY_QUERY[query.status];
    const docs = await this.gigService.getGigsByStatus({
      status,
      limit: query.limit ?? ADMIN_GIG_LIST_DEFAULT_LIMIT,
      sortBy: query.sortBy ?? ADMIN_GIG_LIST_DEFAULT_SORT_BY,
      sortOrder: query.sortOrder ?? ADMIN_GIG_LIST_DEFAULT_SORT_ORDER,
    });

    const gigs: V1AdminGigListItem[] = [];
    for (const doc of docs) {
      const posterUrl = this.gigService.resolveGigPosterPublicUrl(doc.poster);
      const postUrl = await this.gigService.resolvePublishedPostUrl(doc.posts);
      gigs.push(
        this.mapGigToListItem({
          gig: doc,
          posterUrl,
          postUrl,
        }),
      );
    }

    return { gigs };
  }

  private mapGigToListItem(params: MapGigToListItemParams): V1AdminGigListItem {
    const { gig, posterUrl, postUrl } = params;

    const date = msToYmd(gig.date);
    if (!date) {
      throw new Error(`Gig ${String(gig._id)} is missing a valid event date`);
    }

    const ticketsUrl = (gig.ticketsUrl ?? '').trim();

    return {
      publicId: gig.publicId,
      title: gig.title,
      status: gig.status,
      date,
      endDate: msToYmd(gig.endDate),
      city: gig.city,
      countryCode: gig.country,
      venue: gig.venue,
      posterUrl,
      suggestedBy: {
        userId: gig.suggestedBy.userId.toString(),
        username: gig.suggestedBy.username,
        name: gig.suggestedBy.name,
      },
      ticketsUrl: ticketsUrl.length > 0 ? ticketsUrl : undefined,
      postUrl,
      publishPostDate: this.pickTelegramPostDateMs(gig.posts, PostType.Publish),
      moderationPostDate: this.pickTelegramPostDateMs(
        gig.posts,
        PostType.Moderation,
      ),
    };
  }

  private pickTelegramPostDateMs(
    posts: GigDocument['posts'] | undefined,
    postType: PostType,
  ): number | undefined {
    const post = posts?.find(
      (entry) =>
        entry.to === Messenger.Telegram &&
        entry.type === postType &&
        entry.chatId != null &&
        entry.id != null,
    );
    if (!post) {
      return undefined;
    }
    if (typeof post.date === 'number' && Number.isFinite(post.date)) {
      return post.date;
    }
    return undefined;
  }
}
