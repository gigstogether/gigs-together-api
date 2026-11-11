import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  isValidLocalityAliasList,
  isValidLocalityName,
  isValidLocalityTimeZone,
} from './locality.validators';

@Schema()
export class Locality {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Region' })
  regionId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidLocalityName,
  })
  name: string;

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
  { regionId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);
