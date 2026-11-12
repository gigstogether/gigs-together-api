import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  isValidLocalityAliasList,
  isValidLocalityName,
  isValidLocalityQualifier,
  isValidLocalityTimeZone,
} from './locality.validators';

@Schema()
export class Locality {
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  countryIso: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidLocalityName,
  })
  name: string;

  @Prop({
    type: String,
    required: false,
    trim: true,
    validate: isValidLocalityQualifier,
  })
  qualifier?: string;

  @Prop({
    type: [String],
    required: true,
    default: undefined,
    validate: isValidLocalityAliasList,
  })
  aliases: string[];

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidLocalityTimeZone,
  })
  timeZone: string;
}

export type LocalityDocument = HydratedDocument<Locality>;
export const LocalitySchema = SchemaFactory.createForClass(Locality);

LocalitySchema.index(
  { countryIso: 1, name: 1, qualifier: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);
