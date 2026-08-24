import { UnauthorizedException } from '@nestjs/common';
import type { VerifiedAccessToken } from '../types/access-token-identity.types';
import { verifiedAccessTokenToUser } from './verified-access-token-to-user.mapper';

describe('verifiedAccessTokenToUser', () => {
  it('maps telegram verified token to User', () => {
    const verified: VerifiedAccessToken = {
      identity: {
        kind: 'telegram',
        userId: '66a000000000000000000000009',
        telegramUserId: 9,
        snapshot: { firstName: 'Z', username: 'z' },
      },
      userId: '66a000000000000000000000009',
      isAdmin: true,
    };
    const user = verifiedAccessTokenToUser(verified);
    expect(user.isAdmin).toBe(true);
    expect(user.userId).toBe('66a000000000000000000000009');
    expect(user.tgUser.id).toBe(9);
    expect(user.tgUser.first_name).toBe('Z');
    expect(user.tgUser.username).toBe('z');
  });

  it('throws when identity is not telegram', () => {
    const verified = {
      identity: { kind: 'other' },
      isAdmin: false,
    } as unknown as VerifiedAccessToken;
    expect(() => verifiedAccessTokenToUser(verified)).toThrow(
      UnauthorizedException,
    );
  });
});
