import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { Messenger } from '../../shared/types/messenger.enum';
import type { UserStatus } from './types/user.types';

const USER_STATUSES = ['active', 'anonymized'] as const;

@Schema({ _id: false })
export class UserMessengerIdentity {
  @Prop({ type: String, enum: ['messenger'], required: true, immutable: true })
  type: 'messenger';

  @Prop({ type: String, enum: Messenger, required: true, immutable: true })
  messenger: Messenger;

  @Prop({ type: String, required: true, immutable: true, trim: true })
  externalUserId: string;

  @Prop({ type: String, required: false, trim: true })
  username?: string;
}

export const UserMessengerIdentitySchema = SchemaFactory.createForClass(
  UserMessengerIdentity,
);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({
    type: String,
    enum: USER_STATUSES,
    required: true,
    default: 'active',
  })
  status: UserStatus;

  @Prop({
    type: [UserMessengerIdentitySchema],
    required: true,
    validate: {
      validator: (
        userMessengerIdentities: UserMessengerIdentity[],
      ): boolean => {
        if (userMessengerIdentities.length === 0) {
          return false;
        }

        const keys = userMessengerIdentities.map(
          (userMessengerIdentity) =>
            `${userMessengerIdentity.messenger}\u0000${userMessengerIdentity.externalUserId}`,
        );
        return new Set(keys).size === keys.length;
      },
      message: 'messenger identities must be unique within a user',
    },
  })
  identities: UserMessengerIdentity[];

  @Prop({ type: String, required: false, trim: true })
  displayName?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  {
    'identities.messenger': 1,
    'identities.externalUserId': 1,
  },
  {
    unique: true,
    name: 'users_messenger_external_user_id_unique',
  },
);
