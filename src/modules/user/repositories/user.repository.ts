import type {
  FindOrCreateMessengerUserParams,
  User,
} from '../types/user.types';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  upsertMessengerUser(params: FindOrCreateMessengerUserParams): Promise<User>;
}
