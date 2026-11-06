import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { isValidTranslationKey } from '@modules/translation/translation-identifiers';
import {
  isValidCommunitySlug,
  isValidCommunityTimeZone,
} from './community.validators';

@Schema()
export class Community {
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
    lowercase: true,
    trim: true,
    validate: isValidCommunitySlug,
  })
  slug: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidTranslationKey,
  })
  nameTranslationKey: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    validate: isValidCommunityTimeZone,
  })
  timeZone: string;

  @Prop({ type: Boolean, required: true })
  isActive: boolean;
}

export type CommunityDocument = HydratedDocument<Community>;
export const CommunitySchema = SchemaFactory.createForClass(Community);

CommunitySchema.index({ countryIso: 1, slug: 1 }, { unique: true });
CommunitySchema.index({ isActive: 1, countryIso: 1, slug: 1 });
