import { msToYmd } from '@shared/utils/date-formatter';
import type {
  GigSourceForAdminView,
  PlainGig,
} from '@modules/gig/types/gig.types';
import { GigSourceType } from '@modules/gig/types/gig-source-type.enum';
import { isGigSourceMessengerUser } from '@modules/gig/gig-source.guards';
import type { UserSourceProfile } from '../admin-shared/admin-user-source-profile';
import type { VenueSelection } from '@modules/location/venue/venue.service';
import type { V1AdminGigResponseBody } from './types/requests/v1-admin-gigs-list-response';

export interface MapGigToFormData {
  gig: PlainGig;
  venueSelection: VenueSelection;
  userSourceProfile: UserSourceProfile;
  posterUrl?: string;
  mainPostUrl?: string;
  mainPostDate?: number;
  moderationPostUrl?: string;
  moderationPostDate?: number;
}

export function mapGigToFormData(
  params: MapGigToFormData,
): V1AdminGigResponseBody {
  const {
    gig,
    venueSelection,
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

  const locality: V1AdminGigResponseBody['locality'] = {
    id: venueSelection.locality.id,
    countryIso: venueSelection.locality.countryIso,
    name: venueSelection.locality.name,
  };
  if (venueSelection.locality.qualifier !== undefined) {
    locality.qualifier = venueSelection.locality.qualifier;
  }

  return {
    publicId: gig.publicId,
    communityIds: gig.communityIds,
    venueIds: gig.venueIds,
    locality,
    venues: venueSelection.venues.map((venue) => ({
      id: venue.id,
      name: venue.name,
    })),
    title: gig.title,
    date,
    endDate: msToYmd(gig.endDate),
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
