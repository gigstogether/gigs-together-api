import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TranslationFormat = 'plain' | 'icu';

@Schema({ timestamps: true })
export class Translation {
  @Prop({ type: String, required: true })
  key: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  locale: string; // ISO 639-1: e.g. "ES"

  @Prop({ type: String, required: false, lowercase: true, trim: true })
  namespace?: string;

  @Prop({ type: String, required: true })
  value: string;

  @Prop({
    type: String,
    required: true,
    enum: ['plain', 'icu'],
    default: 'plain',
  })
  format: TranslationFormat;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export type TranslationDocument = HydratedDocument<Translation>;
export const TranslationSchema = SchemaFactory.createForClass(Translation);

TranslationSchema.index({ locale: 1, key: 1 }, { unique: true });
TranslationSchema.index({ locale: 1, namespace: 1, key: 1 });
