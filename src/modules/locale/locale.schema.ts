import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/**
 * Locale available in the project.
 * Currently we use language-only locale codes: "en", "es", "ru".
 * Later this can be extended to regional codes like "pt-BR" or "es-MX".
 */
@Schema()
export class Locale {
  @Prop({
    type: String,
    required: true,
    unique: true,
  })
  iso: string;

  @Prop({ type: String, required: true })
  nativeName: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export type LocaleDocument = HydratedDocument<Locale>;
export const LocaleSchema = SchemaFactory.createForClass(Locale);
