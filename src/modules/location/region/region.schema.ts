import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { isValidRegionAliasList, isValidRegionName } from './region.validators';

@Schema()
export class Region {
  @Prop({
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  })
  countryIso: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidRegionName,
  })
  name: string;

  @Prop({
    type: [String],
    required: true,
    default: undefined,
    validate: isValidRegionAliasList,
  })
  aliases: string[];
}

export type RegionDocument = HydratedDocument<Region>;
export const RegionSchema = SchemaFactory.createForClass(Region);

RegionSchema.index(
  { countryIso: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);
