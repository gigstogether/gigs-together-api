import type { Connection } from 'mongoose';
import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

export function up(_connection: Connection): void {
  const isDryRun = isMigrationDryRun();

  if (!isDryRun) {
    // Apply writes here.
  }

  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): void {
  // Optional: revert changes here. Leave empty when the migration is one-way.
}
