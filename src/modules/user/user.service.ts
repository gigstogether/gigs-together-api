import { Inject, Injectable } from '@nestjs/common';
import type { FindOrCreateMessengerUserParams, User } from './types/user.types';
import { USER_REPOSITORY } from './repositories/user.repository';
import type { UserRepository } from './repositories/user.repository';
import type { UserRole } from './types/user-role.enum';

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  findOrCreateMessengerUser(
    params: FindOrCreateMessengerUserParams,
  ): Promise<User> {
    const externalUserId = params.externalUserId.trim();
    if (!externalUserId) {
      throw new Error('externalUserId is required');
    }

    const username = this.normalizeOptionalField(params.username);
    const displayName = this.normalizeOptionalField(params.displayName);

    return this.userRepository.upsertMessengerUser({
      messenger: params.messenger,
      externalUserId,
      ...(username !== undefined ? { username } : {}),
      ...(displayName !== undefined ? { displayName } : {}),
    });
  }

  findActiveUserIdsByRole(role: UserRole): Promise<string[]> {
    return this.userRepository.findActiveUserIdsByRole(role);
  }

  findActiveUserById(userId: string): Promise<User | null> {
    return this.userRepository.findActiveUserById(userId);
  }

  private normalizeOptionalField(
    value: string | undefined,
  ): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }
}
