import type { Connection } from 'mongoose';

import { LegacyGigStatus as Status } from './legacy-gig-status';
import type { LegacyGigStatus } from './legacy-gig-status';
import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const LEGACY_GIG_STATUSES = Object.values(Status);
const NON_PUBLIC_GIG_STATUSES = LEGACY_GIG_STATUSES.filter(
  (status) => status !== Status.Published,
);

export interface GigVisibilityVersionMigrationDocument {
  _id: unknown;
  status?: unknown;
  isVisible?: unknown;
  version?: unknown;
}

export interface GigVisibilityVersionMigrationWriteResult {
  matchedCount: number;
  modifiedCount: number;
}

export interface GigVisibilityVersionMigrationStore {
  readAll(): Promise<GigVisibilityVersionMigrationDocument[]>;
  backfillVersion(): Promise<GigVisibilityVersionMigrationWriteResult>;
  backfillPublishedVisibility(): Promise<GigVisibilityVersionMigrationWriteResult>;
  backfillNonPublicVisibility(): Promise<GigVisibilityVersionMigrationWriteResult>;
}

export interface GigVisibilityVersionSnapshot {
  totalGigs: number;
  statusCounts: Record<LegacyGigStatus, number>;
  missingVersion: number;
  integerVersion: number;
  invalidVersion: number;
  missingVisibility: number;
  visible: number;
  hidden: number;
  invalidVisibility: number;
  legacyPublished: number;
  publishedNotVisible: number;
  visibleNotPublished: number;
  blockingRecordIds: string[];
}

export interface GigVisibilityVersionMigrationPlan {
  versionMatched: number;
  publishedVisibilityMatched: number;
  nonPublicVisibilityMatched: number;
}

export interface GigVisibilityVersionMigrationWrites {
  version: GigVisibilityVersionMigrationWriteResult;
  publishedVisibility: GigVisibilityVersionMigrationWriteResult;
  nonPublicVisibility: GigVisibilityVersionMigrationWriteResult;
}

export interface GigVisibilityVersionMigrationReport {
  mode: 'dry-run' | 'apply';
  before: GigVisibilityVersionSnapshot;
  plan: GigVisibilityVersionMigrationPlan;
  writes: GigVisibilityVersionMigrationWrites;
  projectedAfter: GigVisibilityVersionSnapshot;
  after: GigVisibilityVersionSnapshot;
  canApply: boolean;
  rollback: string;
}

function createStatusCounts(): Record<LegacyGigStatus, number> {
  return {
    [Status.New]: 0,
    [Status.Pending]: 0,
    [Status.Approved]: 0,
    [Status.Rejected]: 0,
    [Status.Published]: 0,
  };
}

function isKnownStatus(value: unknown): value is LegacyGigStatus {
  return LEGACY_GIG_STATUSES.some((status) => status === value);
}

function hasField(
  document: GigVisibilityVersionMigrationDocument,
  field: 'isVisible' | 'version',
): boolean {
  return Object.prototype.hasOwnProperty.call(document, field);
}

function toRecordId(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'toString' in value) {
    return String(value);
  }
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '[invalid-id]';
}

export function buildGigVisibilityVersionSnapshot(
  documents: readonly GigVisibilityVersionMigrationDocument[],
): GigVisibilityVersionSnapshot {
  const statusCounts = createStatusCounts();
  const blockingRecordIds = new Set<string>();
  let missingVersion = 0;
  let integerVersion = 0;
  let invalidVersion = 0;
  let missingVisibility = 0;
  let visible = 0;
  let hidden = 0;
  let invalidVisibility = 0;
  let publishedNotVisible = 0;
  let visibleNotPublished = 0;

  for (const document of documents) {
    const recordId = toRecordId(document._id);
    if (isKnownStatus(document.status)) {
      statusCounts[document.status] += 1;
    } else {
      blockingRecordIds.add(recordId);
    }

    if (!hasField(document, 'version')) {
      missingVersion += 1;
    } else if (
      typeof document.version === 'number' &&
      Number.isInteger(document.version) &&
      document.version >= 0
    ) {
      integerVersion += 1;
    } else {
      invalidVersion += 1;
      blockingRecordIds.add(recordId);
    }

    if (!hasField(document, 'isVisible')) {
      missingVisibility += 1;
      continue;
    }

    if (document.isVisible === true) {
      visible += 1;
      if (document.status !== Status.Published) {
        visibleNotPublished += 1;
        blockingRecordIds.add(recordId);
      }
    } else if (document.isVisible === false) {
      hidden += 1;
      if (document.status === Status.Published) {
        publishedNotVisible += 1;
        blockingRecordIds.add(recordId);
      }
    } else {
      invalidVisibility += 1;
      blockingRecordIds.add(recordId);
    }
  }

  return {
    totalGigs: documents.length,
    statusCounts,
    missingVersion,
    integerVersion,
    invalidVersion,
    missingVisibility,
    visible,
    hidden,
    invalidVisibility,
    legacyPublished: statusCounts[Status.Published],
    publishedNotVisible,
    visibleNotPublished,
    blockingRecordIds: [...blockingRecordIds].sort(),
  };
}

function projectBackfill(
  documents: readonly GigVisibilityVersionMigrationDocument[],
): GigVisibilityVersionMigrationDocument[] {
  return documents.map((document) => {
    const version = hasField(document, 'version') ? document.version : 0;
    const isVisible = hasField(document, 'isVisible')
      ? document.isVisible
      : document.status === Status.Published;

    return { ...document, version, isVisible };
  });
}

function buildPlan(
  documents: readonly GigVisibilityVersionMigrationDocument[],
): GigVisibilityVersionMigrationPlan {
  return {
    versionMatched: documents.filter(
      (document) => !hasField(document, 'version'),
    ).length,
    publishedVisibilityMatched: documents.filter(
      (document) =>
        !hasField(document, 'isVisible') &&
        document.status === Status.Published,
    ).length,
    nonPublicVisibilityMatched: documents.filter(
      (document) =>
        !hasField(document, 'isVisible') &&
        isKnownStatus(document.status) &&
        document.status !== Status.Published,
    ).length,
  };
}

function emptyWriteResult(): GigVisibilityVersionMigrationWriteResult {
  return { matchedCount: 0, modifiedCount: 0 };
}

function isSnapshotComplete(snapshot: GigVisibilityVersionSnapshot): boolean {
  return (
    snapshot.blockingRecordIds.length === 0 &&
    snapshot.missingVersion === 0 &&
    snapshot.invalidVersion === 0 &&
    snapshot.missingVisibility === 0 &&
    snapshot.invalidVisibility === 0 &&
    snapshot.publishedNotVisible === 0 &&
    snapshot.visibleNotPublished === 0 &&
    snapshot.legacyPublished === snapshot.visible &&
    snapshot.totalGigs === snapshot.integerVersion &&
    snapshot.totalGigs === snapshot.visible + snapshot.hidden
  );
}

export async function runGigVisibilityVersionMigration(
  store: GigVisibilityVersionMigrationStore,
  isDryRun: boolean,
): Promise<GigVisibilityVersionMigrationReport> {
  const beforeDocuments = await store.readAll();
  const before = buildGigVisibilityVersionSnapshot(beforeDocuments);
  const plan = buildPlan(beforeDocuments);
  const projectedAfter = buildGigVisibilityVersionSnapshot(
    projectBackfill(beforeDocuments),
  );
  const canApply =
    before.blockingRecordIds.length === 0 && isSnapshotComplete(projectedAfter);

  let writes: GigVisibilityVersionMigrationWrites = {
    version: emptyWriteResult(),
    publishedVisibility: emptyWriteResult(),
    nonPublicVisibility: emptyWriteResult(),
  };

  if (!isDryRun && canApply) {
    writes = {
      version: await store.backfillVersion(),
      publishedVisibility: await store.backfillPublishedVisibility(),
      nonPublicVisibility: await store.backfillNonPublicVisibility(),
    };
  }

  const afterDocuments = isDryRun ? beforeDocuments : await store.readAll();
  const after = buildGigVisibilityVersionSnapshot(afterDocuments);
  if (!isDryRun && canApply && !isSnapshotComplete(after)) {
    throw new Error(
      'Gig visibility/version migration post-apply invariants failed',
    );
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    before,
    plan,
    writes,
    projectedAfter,
    after,
    canApply,
    rollback:
      'One-way additive backfill. Roll back application code if needed; do not remove version or isVisible after Gig writes resume.',
  };
}

function createMongoStore(
  connection: Connection,
): GigVisibilityVersionMigrationStore {
  const collection = connection.collection('gigs');

  async function updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<GigVisibilityVersionMigrationWriteResult> {
    const result = await collection.updateMany(filter, update);
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
  }

  return {
    async readAll(): Promise<GigVisibilityVersionMigrationDocument[]> {
      return collection
        .find(
          {},
          {
            projection: { _id: 1, status: 1, version: 1, isVisible: 1 },
          },
        )
        .toArray();
    },
    backfillVersion: () =>
      updateMany({ version: { $exists: false } }, { $set: { version: 0 } }),
    backfillPublishedVisibility: () =>
      updateMany(
        { isVisible: { $exists: false }, status: Status.Published },
        { $set: { isVisible: true } },
      ),
    backfillNonPublicVisibility: () =>
      updateMany(
        {
          isVisible: { $exists: false },
          status: { $in: NON_PUBLIC_GIG_STATUSES },
        },
        { $set: { isVisible: false } },
      ),
  };
}

export async function up(connection: Connection): Promise<void> {
  const isDryRun = isMigrationDryRun();
  const store = createMongoStore(connection);
  const report = await runGigVisibilityVersionMigration(store, isDryRun);

  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Gig visibility/version migration blocked for record IDs: ${report.before.blockingRecordIds.join(', ')}`,
    );
  }

  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'This migration is intentionally one-way; removing version/isVisible after writes resume is unsafe.',
    ),
  );
}
