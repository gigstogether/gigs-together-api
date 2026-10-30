import { msToYmd } from '@shared/utils/date-formatter';
import type {
  GigFormData,
  GigSourceForAdminView,
  PlainGig,
} from '../gig/types/gig.types';
import type { UserSourceProfile } from './admin-user-source-profile';
import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { isGigSourceMessengerUser } from '../gig/gig-source.guards';

export interface MapGigToFormData {
  readonly gig: PlainGig;
  readonly userSourceProfile: UserSourceProfile;
  readonly posterUrl?: string;
  readonly mainPostUrl?: string;
  readonly mainPostDate?: number;
  readonly moderationPostUrl?: string;
  readonly moderationPostDate?: number;
}

export function mapGigToFormData(params: MapGigToFormData): GigFormData {
  const {
    gig,
    userSourceProfile,
    posterUrl,
    mainPostUrl,
    mainPostDate,
    moderationPostUrl,
    moderationPostDate,
  } = params;

  const date = msToYmd(gig.date);
  if (!date) {
    throw new Error(`Gig ${gig.id} is missing a valid event date`);
  }

  const ticketsUrl = (gig.ticketsUrl ?? '').trim();
  const source = mapGigSource(gig, userSourceProfile);

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
    mainPostUrl,
    mainPostDate,
    moderationPostUrl,
    moderationPostDate,
  };
}

function mapGigSource(
  gig: PlainGig,
  userSourceProfile: UserSourceProfile,
): GigSourceForAdminView {
  switch (gig.source.type) {
    case GigSourceType.User:
      if (isGigSourceMessengerUser(gig.source)) {
        const source: GigSourceForAdminView = {
          type: GigSourceType.User,
          origin: { ...gig.source.origin },
          ...userSourceProfile,
        };
        if (gig.source.userId !== undefined) {
          source.userId = gig.source.userId;
        }
        return source;
      }
      return {
        type: GigSourceType.User,
        userId: gig.source.userId,
        origin: { ...gig.source.origin },
        ...userSourceProfile,
      };
    case GigSourceType.Provider:
      return {
        type: GigSourceType.Provider,
        provider: { ...gig.source.provider },
      };
    default:
      throw new Error('Unsupported Gig source type.');
  }
}
