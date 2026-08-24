import { UserSchema } from './user.schema';

describe('UserSchema', () => {
  it('should define one unique messenger identity index across users', () => {
    const identityIndex = UserSchema.indexes().find(
      ([fields]) =>
        fields['identities.messenger'] === 1 &&
        fields['identities.externalUserId'] === 1,
    );

    expect(identityIndex).toEqual([
      {
        'identities.messenger': 1,
        'identities.externalUserId': 1,
      },
      {
        unique: true,
        name: 'users_messenger_external_user_id_unique',
      },
    ]);
  });

  it('should define the active User role lookup index', () => {
    const roleIndex = UserSchema.indexes().find(
      ([fields]) => fields.status === 1 && fields.roles === 1,
    );

    expect(roleIndex).toEqual([
      { status: 1, roles: 1 },
      { name: 'users_status_roles' },
    ]);
  });
});
