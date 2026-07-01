import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema()
export class Locale {
  @Prop({
    type: String,
    required: true,
    unique: true,
  })
  iso: string; // ISO 639-1: e.g. "ES"

  @Prop({ type: String, required: true })
  nativeName: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export type LocaleDocument = HydratedDocument<Locale>;
export const LocaleSchema = SchemaFactory.createForClass(Locale);
