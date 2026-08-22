import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GigPoster, GigPosterSchema } from '../gig/gig.schema';
import type { GigSuggestedBy } from '../gig/types/gig.types';
import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidatePostType } from './types/gig-candidate-post-type.enum';
import { GigCandidateSource } from './types/gig-candidate-source.enum';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';

@Schema({ _id: false })
export class GigCandidatePost {
  @Prop({ type: String, enum: Messenger, required: true })
  to: Messenger;

  @Prop({ type: String, enum: GigCandidatePostType, required: true })
  type: GigCandidatePostType;

  @Prop({ type: Number, required: true })
  date: number;

  @Prop({ type: Number, required: true })
  id: number;

  @Prop({ type: Number, required: true })
  chatId: number;

  @Prop({ type: String, required: false })
  fileId?: string;
}

export const GigCandidatePostSchema =
  SchemaFactory.createForClass(GigCandidatePost);

@Schema({ timestamps: true })
export class GigCandidate {
  @Prop({
    type: String,
    enum: GigCandidateSource,
    required: true,
  })
  source: GigCandidateSource;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: Number, required: true })
  date: number;

  @Prop({ type: Number, required: false })
  endDate?: number;

  @Prop({ type: String, required: true })
  city: string;

  /**
   * ISO 3166-1 alpha-2 code (uppercase), e.g. "ES", "US".
   */
  @Prop({ type: String, required: true })
  country: string;

  @Prop({ type: String, required: false })
  venue?: string;

  @Prop({ type: String, required: false })
  ticketsUrl?: string;

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

  @Prop({
    type: String,
    enum: GigCandidateStatus,
    default: GigCandidateStatus.Pending,
    required: true,
  })
  status: GigCandidateStatus;

  @Prop({ type: [GigCandidatePostSchema], required: false, default: [] })
  posts: GigCandidatePost[];

  @Prop({ type: Object, required: true })
  suggestedBy: GigSuggestedBy;

  @Prop({ type: Types.ObjectId, required: false, ref: 'Gig' })
  gigId?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export type GigCandidateDocument = HydratedDocument<GigCandidate>;
export const GigCandidateSchema = SchemaFactory.createForClass(GigCandidate);

GigCandidateSchema.index({ status: 1, createdAt: -1 });
GigCandidateSchema.index({ gigId: 1 }, { unique: true, sparse: true });
