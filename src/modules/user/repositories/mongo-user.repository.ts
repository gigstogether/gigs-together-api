import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User } from '../user.schema';
import type { UserDocument } from '../user.schema';
import type {
  FindOrCreateMessengerUserParams,
  User as DomainUser,
  UserMessengerIdentity,
} from '../types/user.types';
import type { UserRepository } from './user.repository';
import { UserRepositoryMapper } from './user.repository.mapper';
import type {
  UserIdLeanDocument,
  UserLeanDocument,
} from './user.repository.mapper';
import type { UserRole } from '../types/user-role.enum';

const USER_PROJECTION = {
  _id: 1,
  status: 1,
  roles: 1,
  identities: 1,
  displayName: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && e.code === 11_000
  );
}

@Injectable()
export class MongoUserRepository implements UserRepository {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async upsertMessengerUser(
    params: FindOrCreateMessengerUserParams,
  ): Promise<DomainUser> {
    const now = new Date();
    const identity = this.toIdentity(params);
    let existingOrCreated: UserLeanDocument | null;

    try {
      existingOrCreated = await this.userModel
        .findOneAndUpdate(
          this.toIdentityFilter(params),
          {
            $setOnInsert: {
              status: 'active',
              roles: [],
              identities: [identity],
              ...(params.displayName !== undefined
                ? { displayName: params.displayName }
                : {}),
              createdAt: now,
              updatedAt: now,
            },
          },
          {
            upsert: true,
            returnDocument: 'after',
            runValidators: true,
            setDefaultsOnInsert: false,
            timestamps: false,
          },
        )
        .select(USER_PROJECTION)
        .lean<UserLeanDocument>()
        .exec();
    } catch (e) {
      if (!isDuplicateKeyError(e)) {
        throw e;
      }

      existingOrCreated = await this.findByMessengerIdentity(params);
      if (!existingOrCreated) {
        throw e;
      }
    }

    if (!existingOrCreated) {
      throw new Error('User upsert did not return a document');
    }

    const user = UserRepositoryMapper.toUser(existingOrCreated);
    if (user.status === 'anonymized' || this.hasCurrentProfile(user, params)) {
      return user;
    }

    return this.refreshActiveProfile(user.id, params);
  }

  async findActiveUserIdsByRole(role: UserRole): Promise<string[]> {
    const users = await this.userModel
      .find({ status: 'active', roles: role })
      .select({ _id: 1 })
      .lean<UserIdLeanDocument[]>()
      .exec();

    return users.map((user) => UserRepositoryMapper.toUserId(user));
  }

  async findActiveUserById(userId: string): Promise<DomainUser | null> {
    const user = await this.userModel
      .findOne({ _id: userId, status: 'active' })
      .select(USER_PROJECTION)
      .lean<UserLeanDocument>()
      .exec();

    return user ? UserRepositoryMapper.toUser(user) : null;
  }

  private async findByMessengerIdentity(
    params: FindOrCreateMessengerUserParams,
  ): Promise<UserLeanDocument | null> {
    return this.userModel
      .findOne(this.toIdentityFilter(params))
      .select(USER_PROJECTION)
      .lean<UserLeanDocument>()
      .exec();
  }

  private async refreshActiveProfile(
    userId: string,
    params: FindOrCreateMessengerUserParams,
  ): Promise<DomainUser> {
    const setFields: Record<string, string> = {};
    const unsetFields: Record<string, 1> = {};

    if (params.username === undefined) {
      unsetFields['identities.$[identity].username'] = 1;
    } else {
      setFields['identities.$[identity].username'] = params.username;
    }

    if (params.displayName === undefined) {
      unsetFields.displayName = 1;
    } else {
      setFields.displayName = params.displayName;
    }

    const updated = await this.userModel
      .findOneAndUpdate(
        { _id: userId, status: 'active' },
        {
          ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
          ...(Object.keys(unsetFields).length > 0
            ? { $unset: unsetFields }
            : {}),
        },
        {
          arrayFilters: [
            {
              'identity.type': 'messenger',
              'identity.messenger': params.messenger,
              'identity.externalUserId': params.externalUserId,
            },
          ],
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .select(USER_PROJECTION)
      .lean<UserLeanDocument>()
      .exec();

    if (!updated) {
      throw new Error('Active user profile refresh did not return a document');
    }

    return UserRepositoryMapper.toUser(updated);
  }

  private toIdentity(
    params: FindOrCreateMessengerUserParams,
  ): UserMessengerIdentity {
    return {
      type: 'messenger',
      messenger: params.messenger,
      externalUserId: params.externalUserId,
      ...(params.username !== undefined ? { username: params.username } : {}),
    };
  }

  private toIdentityFilter(params: FindOrCreateMessengerUserParams) {
    return {
      identities: {
        $elemMatch: {
          type: 'messenger',
          messenger: params.messenger,
          externalUserId: params.externalUserId,
        },
      },
    };
  }

  private hasCurrentProfile(
    user: DomainUser,
    params: FindOrCreateMessengerUserParams,
  ): boolean {
    const identity = user.identities.find(
      (item) =>
        item.type === 'messenger' &&
        item.messenger === params.messenger &&
        item.externalUserId === params.externalUserId,
    );

    return (
      identity?.username === params.username &&
      user.displayName === params.displayName
    );
  }
}
