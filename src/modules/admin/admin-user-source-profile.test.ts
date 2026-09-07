import { Messenger } from '../../shared/types/messenger.enum';
import type { User } from '../user/types/user.types';
import { UserRole } from '../user/types/user-role.enum';
import { getUserSourceProfile } from './admin-user-source-profile';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: '66a000000000000000000001',
    status: 'active',
    roles: [],
    identities: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('getUserSourceProfile', () => {
  it('should expose current profile fields for an admin response', () => {
    const user = buildUser({
      roles: [UserRole.Admin],
      displayName: 'Test Admin',
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
          username: 'test_admin',
        },
      ],
    });

    expect(getUserSourceProfile(user)).toEqual({
      displayName: 'Test Admin',
      isCurrentlyAdmin: true,
      telegramUsername: 'test_admin',
    });
  });

  it('should reject multiple Telegram identities', () => {
    const user = buildUser({
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
          username: 'first_user',
        },
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '43',
          username: 'second_user',
        },
      ],
    });

    expect(() => getUserSourceProfile(user)).toThrow(
      'A User can have only one Telegram identity',
    );
  });
});
