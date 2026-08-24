import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { GigPoster, GigPosterSchema } from '../gig/gig.schema';
import type { GigData } from '../gig/types/gig.types';
import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidatePostType } from './types/gig-candidate-post-type.enum';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type {
  GigCandidateSourceProvider,
  GigCandidateSourceUser,
} from './types/gig-candidate.types';

type GigCandidateStoredSource =
  | (Omit<GigCandidateSourceUser, 'userId'> & { userId: Types.ObjectId })
  | GigCandidateSourceProvider;

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

@Schema({ _id: false })
export class GigCandidateGigDraft {
  @Prop({ type: String, required: false })
  title?: string;

  @Prop({ type: Number, required: false })
  date?: number;

  @Prop({ type: Number, required: false })
  endDate?: number;

  @Prop({ type: String, required: false })
  city?: string;

  /**
   * ISO 3166-1 alpha-2 code (uppercase), e.g. "ES", "US".
   */
  @Prop({ type: String, required: false })
  country?: string;

  @Prop({ type: String, required: false })
  venue?: string;

  @Prop({ type: String, required: false })
  ticketsUrl?: string;

  @Prop({ type: GigPosterSchema, required: false })
  poster?: GigPoster;
}

export const GigCandidateGigDraftSchema =
  SchemaFactory.createForClass(GigCandidateGigDraft);

@Schema({ timestamps: true })
export class GigCandidate {
  @Prop({
    type: SchemaTypes.Mixed,
    required: true,
    immutable: true,
  })
  source: GigCandidateStoredSource;

  @Prop({ type: GigCandidateGigDraftSchema, required: true })
  gigDraft: Partial<GigData>;

  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger })
  version: number;

  @Prop({
    type: String,
    enum: GigCandidateStatus,
    required: true,
  })
  status: GigCandidateStatus;

  @Prop({ type: [GigCandidatePostSchema], required: false, default: [] })
  posts: GigCandidatePost[];

  @Prop({ type: Types.ObjectId, required: false, ref: 'Gig' })
  gigId?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId, required: false, ref: 'User' })
  approvedByUserId?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  rejectedAt?: Date;

  @Prop({ type: Types.ObjectId, required: false, ref: 'User' })
  rejectedByUserId?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export type GigCandidateDocument = HydratedDocument<GigCandidate>;
export const GigCandidateSchema = SchemaFactory.createForClass(GigCandidate);

GigCandidateSchema.index({ status: 1, createdAt: -1, _id: -1 });
GigCandidateSchema.index({ gigId: 1 }, { unique: true, sparse: true });
