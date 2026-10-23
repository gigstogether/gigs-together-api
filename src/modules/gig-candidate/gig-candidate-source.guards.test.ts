import { Messenger } from '../../shared/types/messenger.enum';
import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../gig/types/gig-source-user-origin-type.enum';
import { isGigCandidateSourceMessengerUser } from './gig-candidate-source.guards';

describe('isGigCandidateSourceMessengerUser', () => {
  it('should return true for a messenger candidate source', () => {
    const isMessengerUser = isGigCandidateSourceMessengerUser({
      type: GigSourceType.User,
      origin: {
        type: GigSourceUserOriginType.Messenger,
        messenger: Messenger.Telegram,
        message: { chatId: -100123, messageId: 42 },
      },
      originalText: 'Radiohead in Barcelona',
    });

    expect(isMessengerUser).toBe(true);
  });

  it('should return false for a provider source', () => {
    const isMessengerUser = isGigCandidateSourceMessengerUser({
      type: GigSourceType.Provider,
      provider: {
        name: 'provider',
        externalEventId: 'event-1',
        sourceUrl: 'https://provider.example/events/1',
        fetchedAt: new Date('2026-10-16T00:00:00.000Z'),
      },
    });

    expect(isMessengerUser).toBe(false);
  });
});
