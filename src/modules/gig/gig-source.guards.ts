import { GigSourceType } from './types/gig-source-type.enum';
import { GigSourceUserOriginType } from './types/gig-source-user-origin-type.enum';
import type { GigSource, GigSourceMessengerUser } from './types/gig.types';

export function isGigSourceMessengerUser(
  source: GigSource,
): source is GigSourceMessengerUser {
  return (
    source.type === GigSourceType.User &&
    source.origin.type === GigSourceUserOriginType.Messenger
  );
}
