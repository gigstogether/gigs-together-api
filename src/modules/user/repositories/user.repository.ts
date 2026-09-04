import type {
  FindOrCreateMessengerUserParams,
  User,
} from '../types/user.types';
import type { UserRole } from '../types/user-role.enum';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  upsertMessengerUser(params: FindOrCreateMessengerUserParams): Promise<User>;
  findActiveUserById(userId: string): Promise<User | null>;
  findActiveUserIdsByRole(role: UserRole): Promise<string[]>;
}
