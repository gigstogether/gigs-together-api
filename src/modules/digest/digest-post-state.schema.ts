import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const DIGEST_POST_STATE_COLLECTION = 'digestpublicationstates';

/**
 * Latest successful digest Telegram post for this API (single-row snapshot, not history).
 * The explicit collection name preserves the existing persisted state after the model rename.
 */
@Schema({ collection: DIGEST_POST_STATE_COLLECTION })
export class DigestPostState {
  @Prop({ type: Date, required: true })
  postedAt: Date;

  @Prop({ type: String, required: true })
  postUrl: string;
}

export type DigestPostStateDocument = HydratedDocument<DigestPostState>;

export const DigestPostStateSchema =
  SchemaFactory.createForClass(DigestPostState);
