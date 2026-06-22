/**
 * Opt-in dry-run helpers for migrations (not built into ts-migrate-mongoose).
 * DRY_RUN=true via npm run migrate:up:dry; each migration must check isMigrationDryRun()
 * before writes and call finishMigrationDryRun() so the run is not marked as applied.
 */

export class MigrationDryRunCompleteError extends Error {
  constructor(
    message = 'Dry run complete: no changes were written. Re-run with npm run migrate:up to apply.',
  ) {
    super(message);
    this.name = 'MigrationDryRunCompleteError';
  }
}

export function isMigrationDryRun(): boolean {
  const raw = (process.env.DRY_RUN ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function finishMigrationDryRun(dryRun: boolean, message?: string): void {
  if (dryRun) {
    throw new MigrationDryRunCompleteError(message);
  }
}
