import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { User } from '../types/user.types';

/**
 * Reads `req.user` after `RequireAuthenticated()` (or equivalent guards). Exported for unit tests.
 */
export function getAuthenticatedUserFromContext(ctx: ExecutionContext): User {
  const req = ctx.switchToHttp().getRequest<{ user?: User }>();
  const user = req.user;
  if (!user) {
    throw new UnauthorizedException('Authentication required');
  }
  return user;
}

/**
 * Injects `req.user` after `RequireAuthenticated()` on the route (access JWT cookie).
 */
export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    getAuthenticatedUserFromContext(ctx),
);
