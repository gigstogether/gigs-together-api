import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema()
export class Admin {
  @Prop({ type: String, required: false })
  username?: string;

  @Prop({ type: Number, unique: true, required: true })
  telegramId: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export type AdminDocument = HydratedDocument<Admin>;
export const AdminSchema = SchemaFactory.createForClass(Admin);
