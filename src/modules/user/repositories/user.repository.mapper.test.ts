import { Types } from 'mongoose';
import { Messenger } from '../../../shared/types/messenger.enum';
import { UserRepositoryMapper } from './user.repository.mapper';
import type { UserLeanDocument } from './user.repository.mapper';
import { UserRole } from '../types/user-role.enum';

function userDocument(
  overrides: Partial<UserLeanDocument> = {},
): UserLeanDocument {
  return {
    _id: new Types.ObjectId('66a000000000000000000001'),
    status: 'active',
    roles: [],
    identities: [
      {
        type: 'messenger',
        messenger: Messenger.Telegram,
        externalUserId: '42',
        username: 'arina',
      },
    ],
    displayName: 'Arina Goodboy',
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T11:00:00.000Z'),
    ...overrides,
  };
}

describe('UserRepositoryMapper', () => {
  it('should map Mongo storage fields to the User domain model', () => {
    const user = UserRepositoryMapper.toUser(userDocument());

    expect(user).toEqual({
      id: '66a000000000000000000001',
      status: 'active',
      roles: [],
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
          username: 'arina',
        },
      ],
      displayName: 'Arina Goodboy',
      createdAt: new Date('2026-08-22T10:00:00.000Z'),
      updatedAt: new Date('2026-08-22T11:00:00.000Z'),
    });
  });

  it('should preserve anonymized status without restoring optional profile fields', () => {
    const user = UserRepositoryMapper.toUser(
      userDocument({
        status: 'anonymized',
        identities: [
          {
            type: 'messenger',
            messenger: Messenger.Telegram,
            externalUserId: '42',
          },
        ],
        displayName: undefined,
      }),
    );

    expect(user).toMatchObject({ status: 'anonymized' });
    expect(user.displayName).toBeUndefined();
    expect(user.identities[0]?.username).toBeUndefined();
  });

  it('should reject duplicate messenger identities within one User', () => {
    const identity = {
      type: 'messenger',
      messenger: Messenger.Telegram,
      externalUserId: '42',
    };

    expect(() =>
      UserRepositoryMapper.toUser(
        userDocument({ identities: [identity, { ...identity }] }),
      ),
    ).toThrow('User messenger identities must be unique');
  });

  it('should map the Admin role for an active User', () => {
    const user = UserRepositoryMapper.toUser(
      userDocument({ roles: [UserRole.Admin] }),
    );

    expect(user.roles).toEqual([UserRole.Admin]);
  });

  it('should reject roles on an anonymized User', () => {
    expect(() =>
      UserRepositoryMapper.toUser(
        userDocument({
          status: 'anonymized',
          roles: [UserRole.Admin],
        }),
      ),
    ).toThrow('An anonymized User cannot have roles');
  });
});
