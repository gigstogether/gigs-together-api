import { Messenger } from '../../shared/types/messenger.enum';
import { isGigSourceMessengerUser } from './gig-source.guards';
import { GigSourceType } from './types/gig-source-type.enum';
import { GigSourceUserOriginType } from './types/gig-source-user-origin-type.enum';

describe('isGigSourceMessengerUser', () => {
  it('should return true for a messenger user source without userId', () => {
    const isMessengerUser = isGigSourceMessengerUser({
      type: GigSourceType.User,
      origin: {
        type: GigSourceUserOriginType.Messenger,
        messenger: Messenger.Telegram,
      },
    });

    expect(isMessengerUser).toBe(true);
  });

  it('should return false for an identified user source', () => {
    const isMessengerUser = isGigSourceMessengerUser({
      type: GigSourceType.User,
      userId: '507f1f77bcf86cd799439088',
      origin: { type: GigSourceUserOriginType.Form },
    });

    expect(isMessengerUser).toBe(false);
  });
});
