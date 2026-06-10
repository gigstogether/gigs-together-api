import { Injectable } from '@nestjs/common';
import type { GigDocument } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { Status } from '../gig/types/status.enum';
import { msToYmd } from '../../shared/utils/date-formatter';
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
      limit: query.limit,
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
      hasModerationPost: this.hasModerationPost(gig.posts),
      mainPostPostedAt: this.pickMainPostDateMs(gig.posts),
    };
  }

  private hasModerationPost(posts: GigDocument['posts'] | undefined): boolean {
    return (
      posts?.some(
        (post) =>
          post.to === Messenger.Telegram &&
          post.type === PostType.Moderation &&
          post.chatId != null &&
          post.id != null,
      ) ?? false
    );
  }

  private pickPublishTelegramPost(posts: GigDocument['posts'] | undefined) {
    return posts?.find(
      (post) =>
        post.to === Messenger.Telegram &&
        post.type === PostType.Publish &&
        post.chatId != null &&
        post.id != null,
    );
  }

  private pickMainPostDateMs(
    posts: GigDocument['posts'] | undefined,
  ): number | undefined {
    const post = this.pickPublishTelegramPost(posts);
    if (!post) {
      return undefined;
    }
    if (typeof post.date === 'number' && Number.isFinite(post.date)) {
      return post.date;
    }
    return undefined;
  }
}
