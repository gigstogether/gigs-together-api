/**
 * Dry-run helpers for migrations (not built into ts-migrate-mongoose).
 * Dry run is the default; apply requires DRY_RUN=false via npm run migrate:up:apply.
 * Each migration must check isMigrationDryRun() before writes and call
 * finishMigrationDryRun() so a dry run is not marked as applied.
 */

export class MigrationDryRunCompleteError extends Error {
  constructor(
    message = 'Dry run complete: no changes were written. Re-run with npm run migrate:up:apply to apply.',
  ) {
    super(message);
    this.name = 'MigrationDryRunCompleteError';
  }
}

export function isMigrationDryRun(): boolean {
  const raw = process.env.DRY_RUN?.trim().toLowerCase();
  if (raw === undefined || raw === '') {
    return true;
  }
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return true;
  }
  if (raw === '0' || raw === 'false' || raw === 'no') {
    return false;
  }

  throw new Error('DRY_RUN must be true/false, yes/no, or 1/0');
}

export function finishMigrationDryRun(dryRun: boolean, message?: string): void {
  if (dryRun) {
    throw new MigrationDryRunCompleteError(message);
  }
}
