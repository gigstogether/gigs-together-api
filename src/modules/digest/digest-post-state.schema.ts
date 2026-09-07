import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Latest successful digest Telegram post for this API (single-row snapshot, not history). */
@Schema({ collection: 'digestpoststates' })
export class DigestPostState {
  @Prop({ type: Date, required: true })
  postedAt: Date;

  @Prop({ type: String, required: true })
  postUrl: string;
}

export type DigestPostStateDocument = HydratedDocument<DigestPostState>;

export const DigestPostStateSchema =
  SchemaFactory.createForClass(DigestPostState);
