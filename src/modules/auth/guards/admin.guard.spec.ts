import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { User } from '../types/user.types';
import { AdminGuard } from './admin.guard';

function ctxWithUser(user: User | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  it('should throw ForbiddenException when req.user is missing', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(ctxWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException when req.user.isAdmin is false', () => {
    const guard = new AdminGuard();
    const user: User = {
      userId: '66a000000000000000000000001',
      tgUser: { id: 1, first_name: 'X' },
      isAdmin: false,
    };
    expect(() => guard.canActivate(ctxWithUser(user))).toThrow(
      ForbiddenException,
    );
  });

  it('should return true when req.user.isAdmin is true', () => {
    const guard = new AdminGuard();
    const user: User = {
      userId: '66a000000000000000000000001',
      tgUser: { id: 1, first_name: 'X' },
      isAdmin: true,
    };
    expect(guard.canActivate(ctxWithUser(user))).toBe(true);
  });
});
