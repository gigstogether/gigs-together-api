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

  it('should default to dry run when DRY_RUN env is missing', () => {
    expect(isMigrationDryRun()).toBe(true);
  });

  it('should return false only when DRY_RUN env explicitly disables dry run', () => {
    process.env.DRY_RUN = 'false';
    expect(isMigrationDryRun()).toBe(false);
  });

  it('should reject an ambiguous DRY_RUN value', () => {
    process.env.DRY_RUN = 'apply';
    expect(() => isMigrationDryRun()).toThrow(
      'DRY_RUN must be true/false, yes/no, or 1/0',
    );
  });
});

describe('finishMigrationDryRun', () => {
  it('should throw MigrationDryRunCompleteError when dry run is enabled', () => {
    expect(() => finishMigrationDryRun(true)).toThrow(
      MigrationDryRunCompleteError,
    );
  });

  it('should direct an intentional apply to the explicit apply script', () => {
    expect(() => finishMigrationDryRun(true)).toThrow(
      'Re-run with npm run migrate:up:apply to apply',
    );
  });

  it('should not throw when dry run is disabled', () => {
    expect(() => finishMigrationDryRun(false)).not.toThrow();
  });
});
