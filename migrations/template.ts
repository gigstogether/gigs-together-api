import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

dotenv.config();

export async function up(): Promise<void> {
  const dryRun = isMigrationDryRun();
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI must be set in the environment');
  }
  await mongoose.connect(mongoUri);

  if (!dryRun) {
    // Apply writes here.
  }

  await mongoose.disconnect();
  finishMigrationDryRun(dryRun);
}

export async function down(): Promise<void> {
  // Optional: revert changes here. Leave empty when the migration is one-way.
}
