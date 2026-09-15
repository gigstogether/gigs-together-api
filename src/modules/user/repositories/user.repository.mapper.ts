import { Types } from 'mongoose';
import { Messenger } from '../../../shared/types/messenger.enum';
import type {
  User,
  UserMessengerIdentity,
  UserStatus,
} from '../types/user.types';
import { isRecord } from '../../../shared/utils/is-record';
import { UserRole } from '../types/user-role.enum';

export interface UserLeanDocument {
  _id: unknown;
  status: unknown;
  roles: unknown;
  identities: unknown;
  displayName?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface UserIdLeanDocument {
  _id: unknown;
}

export class UserRepositoryMapper {
  static toUser(doc: UserLeanDocument): User {
    if (!Array.isArray(doc.identities) || doc.identities.length === 0) {
      throw new Error('User identities must be a non-empty array');
    }
    const identities = doc.identities.map((identity) =>
      UserRepositoryMapper.toMessengerIdentity(identity),
    );
    UserRepositoryMapper.assertSingleIdentityPerMessenger(identities);
    const status = UserRepositoryMapper.toStatus(doc.status);
    const roles = UserRepositoryMapper.toRoles(doc.roles);
    if (status === 'anonymized' && roles.length > 0) {
      throw new Error('An anonymized User cannot have roles');
    }
    const displayName = UserRepositoryMapper.toOptionalString(
      'displayName',
      doc.displayName,
    );

    return {
      id: UserRepositoryMapper.toId(doc._id),
      status,
      roles,
      identities,
      ...(displayName !== undefined ? { displayName } : {}),
      createdAt: UserRepositoryMapper.toDate('createdAt', doc.createdAt),
      updatedAt: UserRepositoryMapper.toDate('updatedAt', doc.updatedAt),
    };
  }

  static toUserId(doc: UserIdLeanDocument): string {
    return UserRepositoryMapper.toId(doc._id);
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

  private static toRoles(roles: unknown): UserRole[] {
    if (!Array.isArray(roles)) {
      throw new Error('User roles must be an array');
    }
    if (roles.some((role) => role !== UserRole.Admin)) {
      throw new Error('Unsupported User role');
    }
    if (new Set(roles).size !== roles.length) {
      throw new Error('User roles must be unique');
    }
    return roles;
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

  private static assertSingleIdentityPerMessenger(
    identities: UserMessengerIdentity[],
  ): void {
    const messengers = identities.map((identity) => identity.messenger);
    if (new Set(messengers).size !== messengers.length) {
      throw new Error('A User can have only one identity per messenger');
    }
  }
}
