import type { User } from '../modules/auth/types/user.types';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}
