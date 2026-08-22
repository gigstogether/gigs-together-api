import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { Messenger } from '../../../shared/types/messenger.enum';
import type { UserDocument } from '../user.schema';
import type { UserLeanDocument } from './user.repository.mapper';
import { MongoUserRepository } from './mongo-user.repository';

function storedUser(
  overrides: Partial<UserLeanDocument> = {},
): UserLeanDocument {
  return {
    _id: new Types.ObjectId('66a000000000000000000001'),
    status: 'active',
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
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    ...overrides,
  };
}

function queryResult(value: UserLeanDocument) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(value),
      }),
    }),
  };
}

describe('MongoUserRepository', () => {
  const findOneAndUpdate = vi.fn();
  const findOne = vi.fn();
  const model = { findOneAndUpdate, findOne };
  const repository = new MongoUserRepository(
    model as unknown as Model<UserDocument>,
  );

  beforeEach(() => {
    findOneAndUpdate.mockReset();
    findOne.mockReset();
  });

  it('should use an atomic indexed upsert and return the existing User', async () => {
    findOneAndUpdate.mockReturnValue(queryResult(storedUser()));

    const user = await repository.upsertMessengerUser({
      messenger: Messenger.Telegram,
      externalUserId: '42',
      username: 'arina',
      displayName: 'Arina Goodboy',
    });

    expect(user.id).toBe('66a000000000000000000001');
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        identities: {
          $elemMatch: {
            type: 'messenger',
            messenger: Messenger.Telegram,
            externalUserId: '42',
          },
        },
      },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          status: 'active',
          identities: [
            {
              type: 'messenger',
              messenger: Messenger.Telegram,
              externalUserId: '42',
              username: 'arina',
            },
          ],
        }),
      }),
      expect.objectContaining({
        upsert: true,
        returnDocument: 'after',
        runValidators: true,
      }),
    );
  });

  it('should resolve concurrent upserts to the same internal User id', async () => {
    const sharedDocument = storedUser();
    findOneAndUpdate
      .mockReturnValueOnce(queryResult(sharedDocument))
      .mockImplementationOnce(() => {
        throw { code: 11_000 };
      });
    findOne.mockReturnValue(queryResult(sharedDocument));

    const [first, second] = await Promise.all([
      repository.upsertMessengerUser({
        messenger: Messenger.Telegram,
        externalUserId: '42',
        username: 'arina',
        displayName: 'Arina Goodboy',
      }),
      repository.upsertMessengerUser({
        messenger: Messenger.Telegram,
        externalUserId: '42',
        username: 'arina',
        displayName: 'Arina Goodboy',
      }),
    ]);

    expect(new Set([first.id, second.id])).toEqual(
      new Set(['66a000000000000000000001']),
    );
    expect(findOne).toHaveBeenCalledWith({
      identities: {
        $elemMatch: {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
        },
      },
    });
  });

  it('should refresh changed profile fields for an active User', async () => {
    findOneAndUpdate
      .mockReturnValueOnce(
        queryResult(
          storedUser({
            identities: [
              {
                type: 'messenger',
                messenger: Messenger.Telegram,
                externalUserId: '42',
                username: 'old_username',
              },
            ],
            displayName: 'Old Name',
          }),
        ),
      )
      .mockReturnValueOnce(queryResult(storedUser()));

    const user = await repository.upsertMessengerUser({
      messenger: Messenger.Telegram,
      externalUserId: '42',
      username: 'arina',
      displayName: 'Arina Goodboy',
    });

    expect(user.displayName).toBe('Arina Goodboy');
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { _id: '66a000000000000000000001', status: 'active' },
      {
        $set: {
          'identities.$[identity].username': 'arina',
          displayName: 'Arina Goodboy',
        },
      },
      expect.objectContaining({
        arrayFilters: [
          {
            'identity.type': 'messenger',
            'identity.messenger': Messenger.Telegram,
            'identity.externalUserId': '42',
          },
        ],
      }),
    );
  });

  it('should not reactivate or refresh an anonymized User', async () => {
    const anonymized = storedUser({
      status: 'anonymized',
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
        },
      ],
      displayName: undefined,
    });
    findOneAndUpdate.mockReturnValue(queryResult(anonymized));

    const user = await repository.upsertMessengerUser({
      messenger: Messenger.Telegram,
      externalUserId: '42',
      username: 'restored_username',
      displayName: 'Restored Name',
    });

    expect(user.status).toBe('anonymized');
    expect(user.displayName).toBeUndefined();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('should rethrow non-duplicate Mongo errors without a retry read', async () => {
    const mongoError = { code: 12_345, message: 'write failed' };
    findOneAndUpdate.mockImplementation(() => {
      throw mongoError;
    });

    await expect(
      repository.upsertMessengerUser({
        messenger: Messenger.Telegram,
        externalUserId: '42',
      }),
    ).rejects.toBe(mongoError);
    expect(findOne).not.toHaveBeenCalled();
  });
});
