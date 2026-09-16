import type { Connection } from 'mongoose';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const LEGACY_DIGEST_POST_STATE_COLLECTION = 'digestpublicationstates';
const TARGET_DIGEST_POST_STATE_COLLECTION = 'digestpoststates';

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

export interface DigestPostStateMigrationWrites {
  collectionRenamed: boolean;
  dateFields: DigestPostStateMigrationWriteResult;
}

export interface DigestPostStateMigrationCollections {
  legacyExists: boolean;
  targetExists: boolean;
  legacyDocuments: DigestPostStateMigrationDocument[];
  targetDocuments: DigestPostStateMigrationDocument[];
}

export interface DigestPostStateMigrationStore {
  readCollections(): Promise<DigestPostStateMigrationCollections>;
  renameCollection(): Promise<void>;
  renamePostDate(): Promise<DigestPostStateMigrationWriteResult>;
}

export interface DigestPostStateSnapshot {
  legacyCollectionExists: boolean;
  targetCollectionExists: boolean;
  hasCollectionConflict: boolean;
  legacyCollectionDocuments: number;
  targetCollectionDocuments: number;
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
  plannedCollectionRenames: number;
  plannedDateRenames: number;
  writes: DigestPostStateMigrationWrites;
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
  collections: DigestPostStateMigrationCollections,
): DigestPostStateSnapshot {
  const documents = [
    ...collections.legacyDocuments,
    ...collections.targetDocuments,
  ];
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
    legacyCollectionExists: collections.legacyExists,
    targetCollectionExists: collections.targetExists,
    hasCollectionConflict: collections.legacyExists && collections.targetExists,
    legacyCollectionDocuments: collections.legacyDocuments.length,
    targetCollectionDocuments: collections.targetDocuments.length,
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

function projectDateRename(
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

function projectMigration(
  collections: DigestPostStateMigrationCollections,
): DigestPostStateMigrationCollections {
  const isCollectionRenameRequired =
    collections.legacyExists && !collections.targetExists;
  const legacyDocuments = isCollectionRenameRequired
    ? []
    : projectDateRename(collections.legacyDocuments);
  const targetDocuments = isCollectionRenameRequired
    ? projectDateRename(collections.legacyDocuments)
    : projectDateRename(collections.targetDocuments);

  return {
    legacyExists: collections.legacyExists && !isCollectionRenameRequired,
    targetExists: collections.targetExists || isCollectionRenameRequired,
    legacyDocuments,
    targetDocuments,
  };
}

function isComplete(snapshot: DigestPostStateSnapshot): boolean {
  return (
    !snapshot.legacyCollectionExists &&
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
  const beforeCollections = await store.readCollections();
  const before = buildDigestPostStateSnapshot(beforeCollections);
  const plannedCollectionRenames =
    before.legacyCollectionExists && !before.targetCollectionExists ? 1 : 0;
  const plannedDateRenames = before.legacyDateOnly;
  const projectedAfter = buildDigestPostStateSnapshot(
    projectMigration(beforeCollections),
  );
  const canApply =
    !before.hasCollectionConflict &&
    before.blockingRecordIds.length === 0 &&
    isComplete(projectedAfter);

  let isCollectionRenamed = false;
  let dateFieldWrites = { matchedCount: 0, modifiedCount: 0 };
  if (!isDryRun && canApply && plannedCollectionRenames > 0) {
    await store.renameCollection();
    isCollectionRenamed = true;
  }
  if (!isDryRun && canApply && plannedDateRenames > 0) {
    dateFieldWrites = await store.renamePostDate();
    if (
      dateFieldWrites.matchedCount !== plannedDateRenames ||
      dateFieldWrites.modifiedCount !== plannedDateRenames
    ) {
      throw new Error(
        `Digest post state migration expected ${plannedDateRenames} date rename but matched ${dateFieldWrites.matchedCount} and modified ${dateFieldWrites.modifiedCount}`,
      );
    }
  }

  const afterCollections = isDryRun
    ? beforeCollections
    : await store.readCollections();
  const after = buildDigestPostStateSnapshot(afterCollections);
  if (!isDryRun && canApply && !isComplete(after)) {
    throw new Error('Digest post state migration post-apply invariants failed');
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    before,
    plannedCollectionRenames,
    plannedDateRenames,
    writes: {
      collectionRenamed: isCollectionRenamed,
      dateFields: dateFieldWrites,
    },
    projectedAfter,
    after,
    canApply,
    rollback:
      'Before deploying the renamed runtime model, rename digestpoststates back to digestpublicationstates and postedAt back to its previous field name. After new digest writes begin, restore from backup instead of guessing collection or field ownership.',
  };
}

function requireDatabase(
  connection: Connection,
): NonNullable<Connection['db']> {
  const database = connection.db;
  if (!database) {
    throw new Error('MongoDB connection is not ready');
  }
  return database;
}

function createMongoStore(
  connection: Connection,
): DigestPostStateMigrationStore {
  const database = requireDatabase(connection);

  async function collectionExists(collectionName: string): Promise<boolean> {
    return database
      .listCollections({ name: collectionName }, { nameOnly: true })
      .hasNext();
  }

  async function readCollection(
    collectionName: string,
  ): Promise<DigestPostStateMigrationDocument[]> {
    const documents = await database
      .collection(collectionName)
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
      .toArray();

    return documents.map((document) => {
      const result: DigestPostStateMigrationDocument = {
        _id: document._id,
      };
      if (Object.prototype.hasOwnProperty.call(document, 'publishedAt')) {
        result.publishedAt = document.publishedAt;
      }
      if (Object.prototype.hasOwnProperty.call(document, 'postedAt')) {
        result.postedAt = document.postedAt;
      }
      if (Object.prototype.hasOwnProperty.call(document, 'postUrl')) {
        result.postUrl = document.postUrl;
      }
      return result;
    });
  }

  return {
    async readCollections(): Promise<DigestPostStateMigrationCollections> {
      const [legacyExists, targetExists] = await Promise.all([
        collectionExists(LEGACY_DIGEST_POST_STATE_COLLECTION),
        collectionExists(TARGET_DIGEST_POST_STATE_COLLECTION),
      ]);
      const [legacyDocuments, targetDocuments] = await Promise.all([
        legacyExists
          ? readCollection(LEGACY_DIGEST_POST_STATE_COLLECTION)
          : Promise.resolve([]),
        targetExists
          ? readCollection(TARGET_DIGEST_POST_STATE_COLLECTION)
          : Promise.resolve([]),
      ]);

      return {
        legacyExists,
        targetExists,
        legacyDocuments,
        targetDocuments,
      };
    },
    async renameCollection(): Promise<void> {
      await database
        .collection(LEGACY_DIGEST_POST_STATE_COLLECTION)
        .rename(TARGET_DIGEST_POST_STATE_COLLECTION, { dropTarget: false });
    },
    async renamePostDate(): Promise<DigestPostStateMigrationWriteResult> {
      const result = await database
        .collection(TARGET_DIGEST_POST_STATE_COLLECTION)
        .updateMany(
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
      `Digest post state migration blocked: legacyCollectionExists=${report.before.legacyCollectionExists}, targetCollectionExists=${report.before.targetCollectionExists}, recordIds=${report.before.blockingRecordIds.join(', ')}`,
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
