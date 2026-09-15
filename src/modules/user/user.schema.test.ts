import { model } from 'mongoose';

import { Messenger } from '../../shared/types/messenger.enum';
import { UserSchema } from './user.schema';

const UserValidationModel = model('UserValidation', UserSchema);

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

  it('should reject multiple identities for the same messenger', async () => {
    const user = new UserValidationModel({
      status: 'active',
      roles: [],
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
        },
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '43',
        },
      ],
    });

    await expect(user.validate()).rejects.toThrow(
      'a user can have only one identity per messenger',
    );
  });
});
