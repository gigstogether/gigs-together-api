import type { Types } from 'mongoose';
import type { Connection } from 'mongoose';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const MAIN_POST_TYPE = 'Main';
const BACKUP_COLLECTION = 'gig_timestamps_backfill_backup';

export interface GigTimestampMigrationDocument {
  _id: Types.ObjectId;
  posts?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface PlannedGigTimestamp {
  _id: Types.ObjectId;
  timestamp: Date;
  source: 'mainPost' | 'objectId';
}

interface MigrationWriteCount {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount?: number;
}

export interface GigTimestampMigrationStore {
  readAll(): Promise<GigTimestampMigrationDocument[]>;
  backup(documents: PlannedGigTimestamp[]): Promise<MigrationWriteCount>;
  write(documents: PlannedGigTimestamp[]): Promise<MigrationWriteCount>;
}

interface GigTimestampSnapshot {
  totalGigs: number;
  singleMainPost: number;
  objectIdFallback: number;
  missingTimestamps: number;
  alreadyCorrect: number;
  blockingRecordIds: string[];
}

interface GigTimestampMigrationPlan {
  timestampUpdates: number;
}

interface GigTimestampMigrationWrites {
  backups: MigrationWriteCount;
  timestamps: MigrationWriteCount;
}

interface GigTimestampAnalysis {
  snapshot: GigTimestampSnapshot;
  plan: PlannedGigTimestamp[];
}

export interface GigTimestampMigrationReport {
  mode: 'dry-run' | 'apply';
  before: GigTimestampSnapshot;
  plan: GigTimestampMigrationPlan;
  writes: GigTimestampMigrationWrites;
  after: GigTimestampSnapshot;
  canApply: boolean;
  rollback: string;
}

function emptyWriteCount(): MigrationWriteCount {
  return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
}

function recordId(value: unknown): string {
  return typeof value === 'object' && value !== null && 'toString' in value
    ? String(value)
    : '[invalid-id]';
}

function hasOwn(
  document: GigTimestampMigrationDocument,
  key: 'createdAt' | 'updatedAt',
): boolean {
  return Object.prototype.hasOwnProperty.call(document, key);
}

function mainPostDates(posts: unknown): unknown[] | null {
  if (posts === undefined) return [];
  if (!Array.isArray(posts)) return null;
  const dates: unknown[] = [];
  for (const post of posts) {
    if (
      typeof post !== 'object' ||
      post === null ||
      Array.isArray(post) ||
      !('type' in post) ||
      typeof post.type !== 'string' ||
      !['Intake', 'Moderation', MAIN_POST_TYPE].includes(post.type)
    ) {
      return null;
    }
    if (post.type === MAIN_POST_TYPE) {
      dates.push('date' in post ? post.date : undefined);
    }
  }
  return dates;
}

function deriveTimestamp(
  document: GigTimestampMigrationDocument,
): PlannedGigTimestamp | null {
  const dates = mainPostDates(document.posts);
  if (dates === null || dates.length > 1) return null;
  if (dates.length === 1) {
    const date = dates[0];
    if (typeof date !== 'number' || !Number.isFinite(date)) return null;
    const timestamp = new Date(date);
    return Number.isNaN(timestamp.getTime())
      ? null
      : { _id: document._id, timestamp, source: 'mainPost' };
  }
  return {
    _id: document._id,
    timestamp: document._id.getTimestamp(),
    source: 'objectId',
  };
}

function analyze(
  documents: GigTimestampMigrationDocument[],
): GigTimestampAnalysis {
  const blockingRecordIds = new Set<string>();
  const plan: PlannedGigTimestamp[] = [];
  let singleMainPost = 0;
  let objectIdFallback = 0;
  let missingTimestamps = 0;
  let alreadyCorrect = 0;

  for (const document of documents) {
    const derived = deriveTimestamp(document);
    if (!derived) {
      blockingRecordIds.add(recordId(document._id));
      continue;
    }
    if (derived.source === 'mainPost') singleMainPost += 1;
    else objectIdFallback += 1;

    const hasCreatedAt = hasOwn(document, 'createdAt');
    const hasUpdatedAt = hasOwn(document, 'updatedAt');
    if (hasCreatedAt !== hasUpdatedAt) {
      blockingRecordIds.add(recordId(document._id));
      continue;
    }
    if (!hasCreatedAt) {
      missingTimestamps += 1;
      plan.push(derived);
      continue;
    }
    if (
      document.createdAt instanceof Date &&
      !Number.isNaN(document.createdAt.getTime()) &&
      document.updatedAt instanceof Date &&
      !Number.isNaN(document.updatedAt.getTime())
    ) {
      alreadyCorrect += 1;
    } else {
      blockingRecordIds.add(recordId(document._id));
    }
  }

  return {
    snapshot: {
      totalGigs: documents.length,
      singleMainPost,
      objectIdFallback,
      missingTimestamps,
      alreadyCorrect,
      blockingRecordIds: [...blockingRecordIds].sort(),
    },
    plan,
  };
}

export async function runGigTimestampMigration(
  store: GigTimestampMigrationStore,
  dryRun: boolean,
): Promise<GigTimestampMigrationReport> {
  const beforeAnalysis = analyze(await store.readAll());
  const canPlan = beforeAnalysis.snapshot.blockingRecordIds.length === 0;
  const writes = {
    backups: emptyWriteCount(),
    timestamps: emptyWriteCount(),
  };
  if (!dryRun && canPlan && beforeAnalysis.plan.length > 0) {
    writes.backups = await store.backup(beforeAnalysis.plan);
    if (
      (writes.backups.upsertedCount ?? 0) + writes.backups.matchedCount !==
      beforeAnalysis.plan.length
    ) {
      throw new Error(
        'Gig timestamp backup counts do not match the planned updates',
      );
    }
    writes.timestamps = await store.write(beforeAnalysis.plan);
    if (
      writes.timestamps.matchedCount !== beforeAnalysis.plan.length ||
      writes.timestamps.modifiedCount !== beforeAnalysis.plan.length
    ) {
      throw new Error(
        'Gig timestamp write counts do not match the planned updates',
      );
    }
  }
  const after = dryRun
    ? beforeAnalysis.snapshot
    : analyze(await store.readAll()).snapshot;
  return {
    mode: dryRun ? 'dry-run' : 'apply',
    before: beforeAnalysis.snapshot,
    plan: { timestampUpdates: beforeAnalysis.plan.length },
    writes,
    after,
    canApply:
      canPlan &&
      (dryRun ||
        (after.blockingRecordIds.length === 0 &&
          after.missingTimestamps === 0)),
    rollback: `Use ${BACKUP_COLLECTION} to identify migrated records, then unset only their createdAt/updatedAt fields during a separately approved maintenance rollback.`,
  };
}

function createMongoStore(connection: Connection): GigTimestampMigrationStore {
  const gigs = connection.collection<GigTimestampMigrationDocument>('gigs');
  const backups = connection.collection<{
    _id: Types.ObjectId;
    derivedTimestamp: Date;
    source: 'mainPost' | 'objectId';
    backedUpAt: Date;
  }>(BACKUP_COLLECTION);
  return {
    readAll: () => gigs.find({}).toArray(),
    async backup(documents) {
      if (documents.length === 0) return emptyWriteCount();
      const result = await backups.bulkWrite(
        documents.map((document) => ({
          updateOne: {
            filter: {
              _id: document._id,
              derivedTimestamp: document.timestamp,
              source: document.source,
            },
            update: {
              $setOnInsert: {
                _id: document._id,
                derivedTimestamp: document.timestamp,
                source: document.source,
                backedUpAt: new Date(),
              },
            },
            upsert: true,
          },
        })),
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      };
    },
    async write(documents) {
      if (documents.length === 0) return emptyWriteCount();
      const result = await gigs.bulkWrite(
        documents.map((document) => ({
          updateOne: {
            filter: {
              _id: document._id,
              createdAt: { $exists: false },
              updatedAt: { $exists: false },
            },
            update: {
              $set: {
                createdAt: document.timestamp,
                updatedAt: document.timestamp,
              },
            },
          },
        })),
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    },
  };
}

export async function up(connection: Connection): Promise<void> {
  const dryRun = isMigrationDryRun();
  const report = await runGigTimestampMigration(
    createMongoStore(connection),
    dryRun,
  );
  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Gig timestamp migration blocked for record IDs: ${report.before.blockingRecordIds.join(', ')}`,
    );
  }
  finishMigrationDryRun(dryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'Gig timestamp rollback requires separate approval and verified backup counts.',
    ),
  );
}
