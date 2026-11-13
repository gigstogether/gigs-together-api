import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { isValidVenueAliasList, isValidVenueName } from './venue.validators';

@Schema({ collection: 'venues' })
export class Venue {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Locality' })
  localityId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidVenueName,
  })
  name: string;

  @Prop({
    type: [String],
    required: true,
    default: undefined,
    validate: isValidVenueAliasList,
  })
  aliases: string[];

  @Prop({ type: Boolean, required: true })
  isActive: boolean;
}

export type VenueDocument = HydratedDocument<Venue>;
export const VenueSchema = SchemaFactory.createForClass(Venue);

VenueSchema.index(
  { localityId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);
VenueSchema.index({ isActive: 1, localityId: 1, name: 1 });
