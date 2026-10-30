import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Messenger } from '@shared/types/messenger.enum';
import type {
  GigSourceIdentifiedUser,
  GigSourceMessengerUser,
  GigSourceProvider,
} from './types/gig.types';
import { PostType } from '@shared/types/post-type.enum';
import { isRecord } from '@shared/utils/is-record';
import { GIG_TITLE_MAX_LENGTH } from './gig.constants';
import { GigSourceType } from './types/gig-source-type.enum';
import { GigSourceUserOriginType } from './types/gig-source-user-origin-type.enum';

@Schema({ _id: false })
export class GigPost {
  @Prop({ type: String, enum: Messenger, required: true })
  to: Messenger;

  @Prop({ type: String, enum: PostType, required: true })
  type: PostType;

  @Prop({ type: Number, required: true })
  date: number;

  @Prop({ type: Number, required: true })
  id: number;

  @Prop({ type: Number, required: true })
  chatId: number;

  @Prop({ type: String, required: false })
  fileId?: string;
}

export const GigPostSchema = SchemaFactory.createForClass(GigPost);

@Schema({ _id: false })
export class GigPoster {
  @Prop({ type: String, required: false })
  bucketPath?: string;

  // Original external URL (if uploaded from a remote source)
  @Prop({ type: String, required: false })
  externalUrl?: string;
}

export const GigPosterSchema = SchemaFactory.createForClass(GigPoster);

export type GigStoredSource =
  | (Omit<GigSourceIdentifiedUser, 'userId'> & { userId: Types.ObjectId })
  | (Omit<GigSourceMessengerUser, 'userId'> & { userId?: Types.ObjectId })
  | GigSourceProvider;

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowedKeys = new Set(keys);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isGigSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === GigSourceType.User) {
    if (
      !hasOnlyKeys(value, ['type', 'userId', 'origin']) ||
      !isRecord(value.origin)
    ) {
      return false;
    }

    if (value.origin.type === GigSourceUserOriginType.Messenger) {
      return (
        (value.userId === undefined ||
          (value.userId instanceof Types.ObjectId &&
            Types.ObjectId.isValid(value.userId))) &&
        hasOnlyKeys(value.origin, ['type', 'messenger']) &&
        value.origin.messenger === Messenger.Telegram
      );
    }

    return (
      value.userId instanceof Types.ObjectId &&
      Types.ObjectId.isValid(value.userId) &&
      hasOnlyKeys(value.origin, ['type']) &&
      (value.origin.type === GigSourceUserOriginType.Form ||
        value.origin.type === GigSourceUserOriginType.Admin)
    );
  }

  if (value.type === GigSourceType.Provider) {
    if (
      !hasOnlyKeys(value, ['type', 'provider']) ||
      !isRecord(value.provider)
    ) {
      return false;
    }

    const provider = value.provider;
    return (
      hasOnlyKeys(provider, [
        'name',
        'externalEventId',
        'externalVersionId',
        'sourceUrl',
        'fetchedAt',
        'providerUpdatedAt',
      ]) &&
      typeof provider.name === 'string' &&
      provider.name.length > 0 &&
      typeof provider.externalEventId === 'string' &&
      provider.externalEventId.length > 0 &&
      (provider.externalVersionId === undefined ||
        typeof provider.externalVersionId === 'string') &&
      typeof provider.sourceUrl === 'string' &&
      provider.sourceUrl.length > 0 &&
      provider.fetchedAt instanceof Date &&
      (provider.providerUpdatedAt === undefined ||
        provider.providerUpdatedAt instanceof Date)
    );
  }

  return false;
}

@Schema({ timestamps: true })
export class Gig {
  /**
   * Public stable identifier for URLs/anchors.
   *
   * IMPORTANT:
   * - This is NOT MongoDB `_id`.
   * - We keep it ASCII-friendly (slug + YYYY-MM-DD).
   */
  @Prop({ type: String, required: true, maxlength: 64 })
  publicId: string;

  @Prop({
    type: String,
    default: 'Unknown Gig',
    maxlength: GIG_TITLE_MAX_LENGTH,
  })
  title: string;

  @Prop({ type: Number })
  date: number;

  @Prop({ type: Number })
  endDate?: number;

  @Prop({ type: String })
  city: string; // city code

  /**
   * ISO 3166-1 alpha-2 code (uppercase), e.g. "ES", "US".
   */
  @Prop({ type: String })
  country: string;

  @Prop({ type: String })
  venue: string; // venue name

  @Prop({ type: String })
  ticketsUrl: string;

  @Prop({
    type: GigPosterSchema,
    required: false,
    validate: {
      validator: (v?: GigPoster) => {
        if (!v) return true;
        return !!v.bucketPath;
      },
      message: 'poster must have bucketPath',
    },
  })
  poster?: GigPoster;

  @Prop({ type: Boolean, required: true })
  isVisible: boolean;

  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger })
  version: number;

  @Prop({
    type: SchemaTypes.Mixed,
    required: true,
    immutable: true,
    validate: isGigSource,
  })
  source: GigStoredSource;

  @Prop({ type: [GigPostSchema], required: false, default: [] })
  posts: GigPost[];

  createdAt: Date;

  updatedAt: Date;
}

export type GigDocument = HydratedDocument<Gig>;
export const GigSchema = SchemaFactory.createForClass(Gig);

// Unique public id for anchoring/sharing.
GigSchema.index({ publicId: 1 }, { unique: true });

GigSchema.index(
  { isVisible: 1, country: 1, city: 1, date: 1, _id: 1 },
  { collation: { locale: 'en', strength: 2 } },
);
