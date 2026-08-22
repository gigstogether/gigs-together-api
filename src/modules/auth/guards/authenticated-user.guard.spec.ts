import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { User } from '../types/user.types';
import { AuthenticatedUserGuard } from './authenticated-user.guard';

function ctxWithUser(user: User | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as ExecutionContext;
}

describe('AuthenticatedUserGuard', () => {
  it('throws UnauthorizedException when req.user is missing', () => {
    const guard = new AuthenticatedUserGuard();
    expect(() => guard.canActivate(ctxWithUser(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('returns true when req.user is set', () => {
    const guard = new AuthenticatedUserGuard();
    const user: User = {
      userId: '66a000000000000000000000001',
      tgUser: { id: 1, first_name: 'X' },
      isAdmin: false,
    };
    expect(guard.canActivate(ctxWithUser(user))).toBe(true);
  });
});
