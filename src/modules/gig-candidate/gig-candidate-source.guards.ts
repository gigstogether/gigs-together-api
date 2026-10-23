import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../gig/types/gig-source-user-origin-type.enum';
import type {
  GigCandidateSource,
  GigCandidateSourceMessengerUser,
} from './types/gig-candidate.types';

export function isGigCandidateSourceMessengerUser(
  source: GigCandidateSource,
): source is GigCandidateSourceMessengerUser {
  return (
    source.type === GigSourceType.User &&
    source.origin.type === GigSourceUserOriginType.Messenger
  );
}
