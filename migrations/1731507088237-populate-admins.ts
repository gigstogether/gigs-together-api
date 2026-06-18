import mongoose from 'mongoose';
import { AdminSchema } from '../src/modules/auth/schemas/admin.schema';
import * as dotenv from 'dotenv';

dotenv.config();

const { MONGO_URI } = process.env;
const { BOT_ADMINS } = process.env;

const Admin = mongoose.model('Admin', AdminSchema);

export async function up(): Promise<void> {
  if (!BOT_ADMINS || !MONGO_URI) {
    throw new Error('BOT_ADMINS and MONGO_URI must be set in the environment');
  }

  const admins: { [key: string]: number } = JSON.parse(BOT_ADMINS);
  if (typeof admins !== 'object' || admins === null || Array.isArray(admins)) {
    throw new Error(
      'BOT_ADMINS must be a JSON object mapping username to telegram id',
    );
  }
  await mongoose.connect(MONGO_URI);
  const operations = Object.entries(admins).map(([username, id]) => ({
    updateOne: {
      filter: { telegramId: id }, // Filter by unique field
      update: {
        $setOnInsert: {
          telegramId: id,
          username,
          isActive: true,
        },
      }, // Use $setOnInsert to insert only if the document doesn't exist
      upsert: true, // Enables upsert: create if not found, otherwise no action
    },
  }));

  await Admin.bulkWrite(operations);
}
