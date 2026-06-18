import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema()
export class Language {
  @Prop({
    type: String,
    required: true,
    unique: true,
  })
  iso: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export type LanguageDocument = HydratedDocument<Language>;
export const LanguageSchema = SchemaFactory.createForClass(Language);
