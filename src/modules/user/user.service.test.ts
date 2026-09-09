import { Messenger } from '../../shared/types/messenger.enum';
import type { User } from './types/user.types';
import type { UserRepository } from './repositories/user.repository';
import { UserService } from './user.service';
import { UserRole } from './types/user-role.enum';

function domainUser(status: User['status'] = 'active'): User {
  return {
    id: '66a000000000000000000001',
    status,
    roles: [],
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
  const findActiveUserById = vi.fn();
  const findActiveUsersByIds = vi.fn();
  const findActiveUserIdsByRole = vi.fn();
  const repository = {
    upsertMessengerUser,
    findActiveUserById,
    findActiveUsersByIds,
    findActiveUserIdsByRole,
  };
  const service = new UserService(repository as UserRepository);

  beforeEach(() => {
    upsertMessengerUser.mockReset();
    findActiveUserById.mockReset();
    findActiveUsersByIds.mockReset();
    findActiveUserIdsByRole.mockReset();
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

  it('should load active User ids by role', async () => {
    findActiveUserIdsByRole.mockResolvedValue(['66a000000000000000000001']);

    await expect(
      service.findActiveUserIdsByRole(UserRole.Admin),
    ).resolves.toEqual(['66a000000000000000000001']);
    expect(findActiveUserIdsByRole).toHaveBeenCalledWith(UserRole.Admin);
  });

  it('should load an active User by internal id', async () => {
    const user = domainUser();
    findActiveUserById.mockResolvedValue(user);

    await expect(service.findActiveUserById(user.id)).resolves.toBe(user);
    expect(findActiveUserById).toHaveBeenCalledWith(user.id);
  });

  it('should load active Users by internal ids', async () => {
    const user = domainUser();
    findActiveUsersByIds.mockResolvedValue([user]);

    await expect(service.findActiveUsersByIds([user.id])).resolves.toEqual([
      user,
    ]);
    expect(findActiveUsersByIds).toHaveBeenCalledWith([user.id]);
  });
});
