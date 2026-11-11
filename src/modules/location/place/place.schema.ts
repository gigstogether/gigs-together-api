import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { isValidPlaceAliasList, isValidPlaceName } from './place.validators';

@Schema()
export class Place {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Locality' })
  localityId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidPlaceName,
  })
  name: string;

  @Prop({
    type: [String],
    required: true,
    default: undefined,
    validate: isValidPlaceAliasList,
  })
  aliases: string[];

  @Prop({ type: Boolean, required: true })
  isActive: boolean;
}

export type PlaceDocument = HydratedDocument<Place>;
export const PlaceSchema = SchemaFactory.createForClass(Place);

PlaceSchema.index(
  { localityId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);
PlaceSchema.index({ isActive: 1, localityId: 1, name: 1 });
