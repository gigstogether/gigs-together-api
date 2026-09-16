import type { Connection } from 'mongoose';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const DIGEST_POST_STATE_COLLECTION = 'digestpublicationstates';

export interface DigestPostStateMigrationDocument {
  _id: unknown;
  publishedAt?: unknown;
  postedAt?: unknown;
  postUrl?: unknown;
}

export interface DigestPostStateMigrationWriteResult {
  matchedCount: number;
  modifiedCount: number;
}

export interface DigestPostStateMigrationStore {
  readAll(): Promise<DigestPostStateMigrationDocument[]>;
  renamePostDate(): Promise<DigestPostStateMigrationWriteResult>;
}

export interface DigestPostStateSnapshot {
  totalStateDocuments: number;
  legacyDateOnly: number;
  targetDateOnly: number;
  bothDateFields: number;
  missingDateFields: number;
  invalidLegacyDates: number;
  invalidTargetDates: number;
  invalidPostUrls: number;
  blockingRecordIds: string[];
}

export interface DigestPostStateMigrationReport {
  mode: 'dry-run' | 'apply';
  before: DigestPostStateSnapshot;
  plannedRenames: number;
  writes: DigestPostStateMigrationWriteResult;
  projectedAfter: DigestPostStateSnapshot;
  after: DigestPostStateSnapshot;
  canApply: boolean;
  rollback: string;
}

function hasField(
  document: DigestPostStateMigrationDocument,
  field: 'publishedAt' | 'postedAt',
): boolean {
  return Object.prototype.hasOwnProperty.call(document, field);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toRecordId(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'toString' in value) {
    return String(value);
  }
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '[invalid-id]';
}

export function buildDigestPostStateSnapshot(
  documents: readonly DigestPostStateMigrationDocument[],
): DigestPostStateSnapshot {
  const blockingRecordIds = new Set<string>();
  let legacyDateOnly = 0;
  let targetDateOnly = 0;
  let bothDateFields = 0;
  let missingDateFields = 0;
  let invalidLegacyDates = 0;
  let invalidTargetDates = 0;
  let invalidPostUrls = 0;

  if (documents.length > 1) {
    for (const document of documents) {
      blockingRecordIds.add(toRecordId(document._id));
    }
  }

  for (const document of documents) {
    const recordId = toRecordId(document._id);
    const hasLegacyDate = hasField(document, 'publishedAt');
    const hasTargetDate = hasField(document, 'postedAt');

    if (hasLegacyDate && hasTargetDate) {
      bothDateFields += 1;
      blockingRecordIds.add(recordId);
    } else if (hasLegacyDate) {
      legacyDateOnly += 1;
    } else if (hasTargetDate) {
      targetDateOnly += 1;
    } else {
      missingDateFields += 1;
      blockingRecordIds.add(recordId);
    }

    if (hasLegacyDate && !isValidDate(document.publishedAt)) {
      invalidLegacyDates += 1;
      blockingRecordIds.add(recordId);
    }
    if (hasTargetDate && !isValidDate(document.postedAt)) {
      invalidTargetDates += 1;
      blockingRecordIds.add(recordId);
    }
    if (
      typeof document.postUrl !== 'string' ||
      document.postUrl.trim() === ''
    ) {
      invalidPostUrls += 1;
      blockingRecordIds.add(recordId);
    }
  }

  return {
    totalStateDocuments: documents.length,
    legacyDateOnly,
    targetDateOnly,
    bothDateFields,
    missingDateFields,
    invalidLegacyDates,
    invalidTargetDates,
    invalidPostUrls,
    blockingRecordIds: [...blockingRecordIds].sort(),
  };
}

function projectRename(
  documents: readonly DigestPostStateMigrationDocument[],
): DigestPostStateMigrationDocument[] {
  return documents.map((document) => {
    if (!hasField(document, 'publishedAt') || hasField(document, 'postedAt')) {
      return { ...document };
    }

    const projected = { ...document, postedAt: document.publishedAt };
    delete projected.publishedAt;
    return projected;
  });
}

function isComplete(snapshot: DigestPostStateSnapshot): boolean {
  return (
    snapshot.totalStateDocuments <= 1 &&
    snapshot.legacyDateOnly === 0 &&
    snapshot.targetDateOnly === snapshot.totalStateDocuments &&
    snapshot.bothDateFields === 0 &&
    snapshot.missingDateFields === 0 &&
    snapshot.invalidLegacyDates === 0 &&
    snapshot.invalidTargetDates === 0 &&
    snapshot.invalidPostUrls === 0 &&
    snapshot.blockingRecordIds.length === 0
  );
}

export async function runDigestPostStateMigration(
  store: DigestPostStateMigrationStore,
  isDryRun: boolean,
): Promise<DigestPostStateMigrationReport> {
  const beforeDocuments = await store.readAll();
  const before = buildDigestPostStateSnapshot(beforeDocuments);
  const plannedRenames = before.legacyDateOnly;
  const projectedAfter = buildDigestPostStateSnapshot(
    projectRename(beforeDocuments),
  );
  const canApply =
    before.blockingRecordIds.length === 0 && isComplete(projectedAfter);

  let writes = { matchedCount: 0, modifiedCount: 0 };
  if (!isDryRun && canApply && plannedRenames > 0) {
    writes = await store.renamePostDate();
    if (
      writes.matchedCount !== plannedRenames ||
      writes.modifiedCount !== plannedRenames
    ) {
      throw new Error(
        `Digest post state migration expected ${plannedRenames} rename but matched ${writes.matchedCount} and modified ${writes.modifiedCount}`,
      );
    }
  }

  const afterDocuments = isDryRun ? beforeDocuments : await store.readAll();
  const after = buildDigestPostStateSnapshot(afterDocuments);
  if (!isDryRun && canApply && !isComplete(after)) {
    throw new Error('Digest post state migration post-apply invariants failed');
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    before,
    plannedRenames,
    writes,
    projectedAfter,
    after,
    canApply,
    rollback:
      'Before deploying the renamed runtime model, postedAt can be renamed back to its previous field name. After new digest writes begin, restore from backup instead of guessing field ownership.',
  };
}

function createMongoStore(
  connection: Connection,
): DigestPostStateMigrationStore {
  const collection = connection.collection(DIGEST_POST_STATE_COLLECTION);

  return {
    readAll: () =>
      collection
        .find(
          {},
          {
            projection: {
              _id: 1,
              publishedAt: 1,
              postedAt: 1,
              postUrl: 1,
            },
          },
        )
        .toArray(),
    async renamePostDate(): Promise<DigestPostStateMigrationWriteResult> {
      const result = await collection.updateMany(
        { publishedAt: { $exists: true }, postedAt: { $exists: false } },
        { $rename: { publishedAt: 'postedAt' } },
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    },
  };
}

export async function up(connection: Connection): Promise<void> {
  const isDryRun = isMigrationDryRun();
  const report = await runDigestPostStateMigration(
    createMongoStore(connection),
    isDryRun,
  );

  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Digest post state migration blocked for record IDs: ${report.before.blockingRecordIds.join(', ')}`,
    );
  }
  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'This migration is one-way after the renamed runtime model starts writing digest state.',
    ),
  );
}
