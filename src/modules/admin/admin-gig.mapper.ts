import { msToYmd } from '../../shared/utils/date-formatter';
import type { PlainGig, GigFormData } from '../gig/types/gig.types';

export interface MapGigToFormData {
  readonly gig: PlainGig;
  readonly posterUrl?: string;
  readonly publishPostUrl?: string;
  readonly publishPostDate?: number;
  readonly moderationPostUrl?: string;
  readonly moderationPostDate?: number;
}

export function mapGigToFormData(params: MapGigToFormData): GigFormData {
  const {
    gig,
    posterUrl,
    publishPostUrl,
    publishPostDate,
    moderationPostUrl,
    moderationPostDate,
  } = params;

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
    isVisible: gig.isVisible,
    version: gig.version,
    suggestedBy: {
      userId: gig.suggestedBy.userId.toString(),
      username: gig.suggestedBy.username,
      name: gig.suggestedBy.name,
    },
    publishPostUrl,
    publishPostDate,
    moderationPostUrl,
    moderationPostDate,
  };
}
