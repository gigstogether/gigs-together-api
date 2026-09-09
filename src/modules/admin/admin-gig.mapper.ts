import { msToYmd } from '../../shared/utils/date-formatter';
import type {
  GigFormData,
  GigSourceForAdminView,
  PlainGig,
} from '../gig/types/gig.types';
import type { UserSourceProfile } from './admin-user-source-profile';

export interface MapGigToFormData {
  readonly gig: PlainGig;
  readonly userSourceProfile: UserSourceProfile;
  readonly posterUrl?: string;
  readonly publishPostUrl?: string;
  readonly publishPostDate?: number;
  readonly moderationPostUrl?: string;
  readonly moderationPostDate?: number;
}

export function mapGigToFormData(params: MapGigToFormData): GigFormData {
  const {
    gig,
    userSourceProfile,
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
  const source: GigSourceForAdminView =
    gig.source.type === 'user'
      ? {
          type: 'user',
          userId: gig.source.userId.toString(),
          origin: { type: gig.source.origin.type },
          ...userSourceProfile,
        }
      : {
          type: 'provider',
          provider: { ...gig.source.provider },
        };

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
    isVisible: gig.isVisible,
    version: gig.version,
    source,
    publishPostUrl,
    publishPostDate,
    moderationPostUrl,
    moderationPostDate,
  };
}
