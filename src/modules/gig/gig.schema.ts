import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Status } from './types/status.enum';
import { Messenger } from './types/messenger.enum';
import { GigSuggestedBy } from './types/gig.types';
import { PostType } from './types/postType.enum';

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

@Schema()
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

  @Prop({ type: String, default: 'Unknown Gig' })
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

  @Prop({ type: String, enum: Status, default: Status.New })
  status: Status;

  @Prop({ type: [GigPostSchema], required: false, default: [] })
  posts: GigPost[];

  @Prop({ type: Object, required: true })
  suggestedBy: GigSuggestedBy;

  @Prop({ type: Types.ObjectId, required: false, ref: 'GigCandidate' })
  gigCandidateId?: Types.ObjectId;
}

export type GigDocument = HydratedDocument<Gig>;
export const GigSchema = SchemaFactory.createForClass(Gig);

// Unique public id for anchoring/sharing.
GigSchema.index({ publicId: 1 }, { unique: true });

GigSchema.index(
  { country: 1, city: 1 },
  { collation: { locale: 'en', strength: 2 } },
);

GigSchema.index({ gigCandidateId: 1 }, { unique: true, sparse: true });
