import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema()
export class Country {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  iso: string; // ISO 3166-1 alpha-2: e.g. "ES"
}

export type CountryDocument = HydratedDocument<Country>;
export const CountrySchema = SchemaFactory.createForClass(Country);

@Schema()
export class City {
  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  country: string; // ISO 3166-1 alpha-2: e.g. "ES"
}

export type CityDocument = HydratedDocument<City>;
export const CitySchema = SchemaFactory.createForClass(City);

CitySchema.index({ country: 1, code: 1 }, { unique: true });
