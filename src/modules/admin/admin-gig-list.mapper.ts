import type { GigDocument } from '../gig/gig.schema';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import type { V1AdminGigListItem } from './types/requests/v1-admin-gigs-list-response';
import { msToYmd } from '../../shared/utils/date-formatter';

function hasModerationPost(posts: GigDocument['posts'] | undefined) {
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

function pickPublishTelegramPost(posts: GigDocument['posts'] | undefined) {
  return posts?.find(
    (post) =>
      post.to === Messenger.Telegram &&
      post.type === PostType.Publish &&
      post.chatId != null &&
      post.id != null,
  );
}

function pickMainPostDateMs(
  posts: GigDocument['posts'] | undefined,
): number | undefined {
  const post = pickPublishTelegramPost(posts);
  if (!post) {
    return undefined;
  }
  if (typeof post.date === 'number' && Number.isFinite(post.date)) {
    return post.date;
  }
  return undefined;
}

export interface MapGigToAdminListItemParams {
  readonly gig: GigDocument;
  readonly posterUrl?: string;
  readonly postUrl?: string;
}

export function mapGigToAdminListItem(
  params: MapGigToAdminListItemParams,
): V1AdminGigListItem {
  const { gig, posterUrl, postUrl } = params;

  const date = msToYmd(gig.date);
  if (!date) {
    throw new Error(`Gig ${String(gig._id)} is missing a valid event date`);
  }

  const ticketsUrl = (gig.ticketsUrl ?? '').trim();

  return {
    id: String(gig._id),
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
    hasModerationPost: hasModerationPost(gig.posts),
    mainPostPostedAt: pickMainPostDateMs(gig.posts),
  };
}
