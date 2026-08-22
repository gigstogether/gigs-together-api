import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { User } from '../types/user.types';
import { getAuthenticatedUserFromContext } from './authenticated-user.decorator';

describe('getAuthenticatedUserFromContext', () => {
  it('returns req.user when present', () => {
    const user: User = {
      userId: '66a000000000000000000000002',
      tgUser: { id: 2, first_name: 'Y' },
      isAdmin: false,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as ExecutionContext;
    expect(getAuthenticatedUserFromContext(ctx)).toEqual(user);
  });

  it('throws UnauthorizedException when req.user is missing', () => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as ExecutionContext;
    expect(() => getAuthenticatedUserFromContext(ctx)).toThrow(
      UnauthorizedException,
    );
  });
});
