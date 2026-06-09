import { afterEach, describe, expect, it } from 'vitest';

import {
  MigrationDryRunCompleteError,
  finishMigrationDryRun,
  isMigrationDryRun,
} from './migration-cli';

describe('isMigrationDryRun', () => {
  afterEach(() => {
    delete process.env.DRY_RUN;
  });

  it('should return true when DRY_RUN env is true', () => {
    process.env.DRY_RUN = 'true';
    expect(isMigrationDryRun()).toBe(true);
  });

  it('should return false when DRY_RUN env is missing', () => {
    expect(isMigrationDryRun()).toBe(false);
  });
});

describe('finishMigrationDryRun', () => {
  it('should throw MigrationDryRunCompleteError when dry run is enabled', () => {
    expect(() => finishMigrationDryRun(true)).toThrow(
      MigrationDryRunCompleteError,
    );
  });

  it('should not throw when dry run is disabled', () => {
    expect(() => finishMigrationDryRun(false)).not.toThrow();
  });
});
