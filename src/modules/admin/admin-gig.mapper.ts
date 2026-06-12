import { msToYmd } from '../../shared/utils/date-formatter';
import type { PlainGig, GigFormDataByPublicId } from '../gig/types/gig.types';
import { PostType } from '../gig/types/postType.enum';
import type { GigPost } from '../gig/gig.schema';
import { Messenger } from '../gig/types/messenger.enum';

export interface MapGigToFormDataByPublicIdParams {
  readonly gig: PlainGig;
  readonly posterUrl?: string;
  readonly publishPostUrl?: string;
}

function pickTelegramPostDateMs(
  posts: GigPost[] | undefined,
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

export function mapGigToFormDataByPublicId(
  params: MapGigToFormDataByPublicIdParams,
): GigFormDataByPublicId {
  const { gig, posterUrl, publishPostUrl } = params;

  const date = msToYmd(gig.date);
  if (!date) {
    throw new Error(`Gig ${String(gig._id)} is missing a valid event date`);
  }

  const ticketsUrl = (gig.ticketsUrl ?? '').trim();

  return {
    publicId: gig.publicId,
    title: gig.title,
    date,
    endDate: msToYmd(gig.endDate),
    city: gig.city,
    country: gig.country,
    venue: gig.venue,
    ticketsUrl,
    posterUrl,
    status: gig.status,
    suggestedBy: {
      userId: gig.suggestedBy.userId.toString(),
      username: gig.suggestedBy.username,
      name: gig.suggestedBy.name,
    },
    publishPostUrl,
    publishPostDate: pickTelegramPostDateMs(gig.posts, PostType.Publish),
    moderationPostDate: pickTelegramPostDateMs(gig.posts, PostType.Moderation),
  };
}
