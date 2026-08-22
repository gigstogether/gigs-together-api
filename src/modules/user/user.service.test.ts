import { Messenger } from '../gig/types/messenger.enum';
import type { User } from './types/user.types';
import type { UserRepository } from './repositories/user.repository';
import { UserService } from './user.service';

function domainUser(status: User['status'] = 'active'): User {
  return {
    id: '66a000000000000000000001',
    status,
    identities: [
      {
        type: 'messenger',
        messenger: Messenger.Telegram,
        externalUserId: '42',
      },
    ],
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
  };
}

describe('UserService', () => {
  const upsertMessengerUser = vi.fn();
  const repository = { upsertMessengerUser };
  const service = new UserService(repository as UserRepository);

  beforeEach(() => {
    upsertMessengerUser.mockReset();
  });

  it('should normalize messenger identity and profile fields before upsert', async () => {
    upsertMessengerUser.mockResolvedValue(domainUser());

    await service.findOrCreateMessengerUser({
      messenger: Messenger.Telegram,
      externalUserId: ' 42 ',
      username: ' arina ',
      displayName: ' Arina Goodboy ',
    });

    expect(upsertMessengerUser).toHaveBeenCalledWith({
      messenger: Messenger.Telegram,
      externalUserId: '42',
      username: 'arina',
      displayName: 'Arina Goodboy',
    });
  });

  it('should return an existing anonymized User without changing its status', async () => {
    const anonymizedUser = domainUser('anonymized');
    upsertMessengerUser.mockResolvedValue(anonymizedUser);

    const user = await service.findOrCreateMessengerUser({
      messenger: Messenger.Telegram,
      externalUserId: '42',
      username: 'new_username',
    });

    expect(user).toBe(anonymizedUser);
    expect(user.status).toBe('anonymized');
  });

  it('should reject an empty external user id', () => {
    expect(() =>
      service.findOrCreateMessengerUser({
        messenger: Messenger.Telegram,
        externalUserId: '   ',
      }),
    ).toThrow('externalUserId is required');
  });
});
