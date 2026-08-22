import { Types } from 'mongoose';
import { Messenger } from '../../gig/types/messenger.enum';
import type {
  User,
  UserMessengerIdentity,
  UserStatus,
} from '../types/user.types';
import { isRecord } from '../../../shared/utils/is-record';

export interface UserLeanDocument {
  _id: unknown;
  status: unknown;
  identities: unknown;
  displayName?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export class UserRepositoryMapper {
  static toUser(doc: UserLeanDocument): User {
    if (!Array.isArray(doc.identities) || doc.identities.length === 0) {
      throw new Error('User identities must be a non-empty array');
    }
    const identities = doc.identities.map((identity) =>
      UserRepositoryMapper.toMessengerIdentity(identity),
    );
    UserRepositoryMapper.assertUniqueIdentities(identities);
    const displayName = UserRepositoryMapper.toOptionalString(
      'displayName',
      doc.displayName,
    );

    return {
      id: UserRepositoryMapper.toId(doc._id),
      status: UserRepositoryMapper.toStatus(doc.status),
      identities,
      ...(displayName !== undefined ? { displayName } : {}),
      createdAt: UserRepositoryMapper.toDate('createdAt', doc.createdAt),
      updatedAt: UserRepositoryMapper.toDate('updatedAt', doc.updatedAt),
    };
  }

  private static toMessengerIdentity(identity: unknown): UserMessengerIdentity {
    if (!isRecord(identity)) {
      throw new Error('User messenger identity must be an object');
    }
    if (identity.type !== 'messenger') {
      throw new Error('Unsupported user identity type');
    }
    if (identity.messenger !== Messenger.Telegram) {
      throw new Error('Unsupported messenger');
    }

    if (typeof identity.externalUserId !== 'string') {
      throw new Error(
        'User messenger identity externalUserId must be a string',
      );
    }
    const externalUserId = identity.externalUserId.trim();
    if (!externalUserId) {
      throw new Error('User messenger identity externalUserId is required');
    }

    const username = UserRepositoryMapper.toOptionalString(
      'username',
      identity.username,
    );

    return {
      type: 'messenger',
      messenger: identity.messenger,
      externalUserId,
      ...(username !== undefined ? { username } : {}),
    };
  }

  private static toId(id: unknown): string {
    if (!(id instanceof Types.ObjectId)) {
      throw new Error('User _id must be an ObjectId');
    }
    return id.toHexString();
  }

  private static toStatus(status: unknown): UserStatus {
    if (status === 'active' || status === 'anonymized') {
      return status;
    }
    throw new Error('Unsupported user status');
  }

  private static toDate(field: string, value: unknown): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error(`User ${field} must be a valid Date`);
    }
    return value;
  }

  private static toOptionalString(
    field: string,
    value: unknown,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new Error(`User ${field} must be a string`);
    }
    const normalized = value.trim();
    if (!normalized) {
      throw new Error(`User ${field} must not be empty`);
    }
    return normalized;
  }

  private static assertUniqueIdentities(
    identities: UserMessengerIdentity[],
  ): void {
    const keys = identities.map(
      (identity) => `${identity.messenger}\u0000${identity.externalUserId}`,
    );
    if (new Set(keys).size !== keys.length) {
      throw new Error('User messenger identities must be unique');
    }
  }
}
