import { isDeepStrictEqual } from 'node:util';
import type { Connection } from 'mongoose';
import type { Types } from 'mongoose';

const Status = {
  New: 'New',
  Pending: 'Pending',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Published: 'Published',
} as const;
type Status = (typeof Status)[keyof typeof Status];

const GigCandidateStatus = { Reviewing: 'Reviewing' } as const;
const PostType = {
  Moderation: 'Moderation',
  Main: 'Main',
  Publish: 'Publish',
} as const;

const MIGRATION_NAME = 'migrate-legacy-gigs-to-gig-candidates';
const DELETE_CONFIRMATION = 'delete-non-public-legacy-gigs';
const MIGRATABLE_STATUSES = [Status.New, Status.Pending, Status.Approved];

function isMigrationDryRun(): boolean {
  const raw = process.env.DRY_RUN?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  throw new Error('DRY_RUN must be true/false, yes/no, or 1/0');
}

function finishMigrationDryRun(isDryRun: boolean): void {
  if (isDryRun) {
    throw new Error(
      'Dry run complete: no changes were written. Re-run with npm run migrate:up:single:apply to apply.',
    );
  }
}

type MigrationDocument = Record<string, unknown> & { _id: Types.ObjectId };

interface Stage9BackupDocument extends MigrationDocument {
  migration: string;
  originalGig: MigrationDocument;
}

interface Stage9WriteResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount?: number;
  deletedCount?: number;
}

export interface Stage9MigrationStore {
  readGigs(): Promise<MigrationDocument[]>;
  readGigCandidates(): Promise<MigrationDocument[]>;
  readUsers(): Promise<MigrationDocument[]>;
  readBackups(): Promise<Stage9BackupDocument[]>;
  backupGigs(gigs: MigrationDocument[]): Promise<Stage9WriteResult>;
  insertGigCandidates(
    gigCandidates: MigrationDocument[],
  ): Promise<Stage9WriteResult>;
  updatePublishedGigs(gigs: MigrationDocument[]): Promise<Stage9WriteResult>;
  deleteMigratedGigs(ids: Types.ObjectId[]): Promise<Stage9WriteResult>;
}

interface Stage9Analysis {
  statusCounts: Record<Status, number>;
  retainedPublishedGigs: number;
  gigCandidatesToCreate: MigrationDocument[];
  alreadyMigratedGigCandidates: number;
  legacyGigsToDelete: MigrationDocument[];
  publishedGigsToUpdate: MigrationDocument[];
  publishPostsToConvert: number;
  backupDocumentsToCreate: MigrationDocument[];
  blockingRecordIds: string[];
  blockingReasons: Record<string, string[]>;
}

export interface Stage9MigrationReport {
  mode: 'dry-run' | 'apply';
  before: {
    totalGigs: number;
    statusCounts: Record<Status, number>;
    totalGigCandidates: number;
    totalBackups: number;
  };
  plan: {
    retainedPublishedGigs: number;
    gigCandidatesToCreate: number;
    alreadyMigratedGigCandidates: number;
    legacyGigsToDelete: number;
    publishedGigsToUpdate: number;
    publishPostsToConvert: number;
    backupDocumentsToCreate: number;
    gigCandidateTimestampsDerivedFromLegacyGigObjectIds: number;
  };
  projectedAfter: {
    totalGigs: number;
    statusCounts: Record<Status, number>;
    totalGigCandidates: number;
    totalBackups: number;
  };
  writes: {
    backups: Stage9WriteResult;
    gigCandidates: Stage9WriteResult;
    publishedGigs: Stage9WriteResult;
    legacyGigs: Stage9WriteResult;
  };
  after: {
    totalGigs: number;
    statusCounts: Record<Status, number>;
    totalGigCandidates: number;
    totalBackups: number;
  };
  blockingRecordIds: string[];
  blockingReasons: Record<string, string[]>;
  canApply: boolean;
  destructiveApplyConfirmation: string | null;
  rollback: string;
}

function emptyWriteResult(): Stage9WriteResult {
  return {
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 0,
    deletedCount: 0,
  };
}

function hasField(document: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(document, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecordId(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'toString' in value) {
    return String(value);
  }
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '[invalid-id]';
}

function createStatusCounts(): Record<Status, number> {
  return {
    [Status.New]: 0,
    [Status.Pending]: 0,
    [Status.Approved]: 0,
    [Status.Rejected]: 0,
    [Status.Published]: 0,
  };
}

function isLegacyStatus(value: unknown): value is Status {
  return Object.values(Status).some((status) => status === value);
}

function isMigratableStatus(value: unknown): value is Status {
  return MIGRATABLE_STATUSES.some((status) => status === value);
}

function timestampFromGigId(id: Types.ObjectId): Date {
  return id.getTimestamp();
}

function normalizeExternalUserId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value);
  }
  return null;
}

function buildUserMap(
  users: readonly MigrationDocument[],
): Map<string, unknown[]> {
  const result = new Map<string, unknown[]>();
  for (const user of users) {
    if (
      user.status !== 'active' ||
      !Array.isArray(user.roles) ||
      !user.roles.includes('admin') ||
      !Array.isArray(user.identities)
    ) {
      continue;
    }
    for (const identity of user.identities) {
      if (
        isRecord(identity) &&
        identity.type === 'messenger' &&
        identity.messenger === 'Telegram' &&
        typeof identity.externalUserId === 'string' &&
        identity.externalUserId.trim()
      ) {
        const externalUserId = identity.externalUserId.trim();
        const ids = result.get(externalUserId) ?? [];
        ids.push(user._id);
        result.set(externalUserId, ids);
      }
    }
  }
  return result;
}

function resolveUserId(
  gig: MigrationDocument,
  usersByExternalUserId: ReadonlyMap<string, unknown[]>,
): unknown | null {
  if (!isRecord(gig.suggestedBy)) {
    return null;
  }
  const externalUserId = normalizeExternalUserId(gig.suggestedBy.userId);
  if (externalUserId === null) {
    return null;
  }
  const matches = usersByExternalUserId.get(externalUserId) ?? [];
  return matches.length === 1 ? matches[0] : null;
}

function buildSource(userId: unknown): Record<string, unknown> {
  return { type: 'user', userId, origin: { type: 'admin' } };
}

function buildGigDraft(gig: MigrationDocument): Record<string, unknown> {
  const gigDraft: Record<string, unknown> = {};
  for (const field of [
    'title',
    'date',
    'endDate',
    'city',
    'country',
    'venue',
    'ticketsUrl',
    'poster',
  ]) {
    if (hasField(gig, field)) {
      gigDraft[field] = gig[field];
    }
  }
  return gigDraft;
}

function buildModerationPosts(gig: MigrationDocument): unknown[] | null {
  if (!hasField(gig, 'posts')) {
    return [];
  }
  if (!Array.isArray(gig.posts)) {
    return null;
  }
  if (
    gig.posts.some(
      (post) => !isRecord(post) || post.type !== PostType.Moderation,
    )
  ) {
    return null;
  }
  return gig.posts;
}

function buildGigCandidate(
  gig: MigrationDocument,
  userId: unknown,
): MigrationDocument | null {
  const timestamp = timestampFromGigId(gig._id);
  const posts = buildModerationPosts(gig);
  if (posts === null) {
    return null;
  }
  return {
    _id: gig._id,
    source: buildSource(userId),
    gigDraft: buildGigDraft(gig),
    version: 0,
    status: GigCandidateStatus.Reviewing,
    posts,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildPublishedGig(
  gig: MigrationDocument,
  userId: unknown,
): MigrationDocument | null {
  if (!Array.isArray(gig.posts)) {
    return null;
  }
  return {
    ...gig,
    source: buildSource(userId),
    isVisible: true,
    posts: gig.posts.map((post) =>
      isRecord(post) && post.type === PostType.Publish
        ? { ...post, type: PostType.Main }
        : post,
    ),
  };
}

function isExpectedGigCandidate(
  actual: MigrationDocument,
  expected: MigrationDocument,
): boolean {
  return isDeepStrictEqual(actual, expected);
}

function countPublishPosts(gig: MigrationDocument): number {
  return Array.isArray(gig.posts)
    ? gig.posts.filter(
        (post) => isRecord(post) && post.type === PostType.Publish,
      ).length
    : 0;
}

function analyze(
  gigs: readonly MigrationDocument[],
  gigCandidates: readonly MigrationDocument[],
  users: readonly MigrationDocument[],
  backups: readonly Stage9BackupDocument[],
): Stage9Analysis {
  const statusCounts = createStatusCounts();
  const blockingRecordIds = new Set<string>();
  const blockingReasonsById = new Map<string, Set<string>>();
  const block = (recordId: string, reason: string): void => {
    blockingRecordIds.add(recordId);
    const reasons = blockingReasonsById.get(recordId) ?? new Set<string>();
    reasons.add(reason);
    blockingReasonsById.set(recordId, reasons);
  };
  const usersByExternalUserId = buildUserMap(users);
  const gigCandidatesById = new Map(
    gigCandidates.map((gigCandidate) => [
      toRecordId(gigCandidate._id),
      gigCandidate,
    ]),
  );
  const backupsById = new Map(
    backups
      .filter((backup) => backup.migration === MIGRATION_NAME)
      .map((backup) => [toRecordId(backup._id), backup]),
  );
  const liveGigIds = new Set(gigs.map((gig) => toRecordId(gig._id)));
  const gigCandidatesToCreate: MigrationDocument[] = [];
  const legacyGigsToDelete: MigrationDocument[] = [];
  const publishedGigsToUpdate: MigrationDocument[] = [];
  const backupDocumentsToCreate: MigrationDocument[] = [];
  let alreadyMigratedGigCandidates = 0;
  let publishPostsToConvert = 0;

  const publicIds = new Map<string, string[]>();
  for (const gig of gigs) {
    const gigId = toRecordId(gig._id);
    if (!isLegacyStatus(gig.status)) {
      block(gigId, 'unknownLegacyStatus');
      continue;
    }
    statusCounts[gig.status] += 1;
    if (gig.status === Status.Rejected) {
      block(gigId, 'rejectedGigRequiresExplicitDecision');
    }
    if (
      !Number.isInteger(gig.version) ||
      Number(gig.version) < 0 ||
      (gig.status === Status.Published
        ? gig.isVisible !== true
        : gig.isVisible !== false)
    ) {
      block(gigId, 'invalidStage8VersionOrVisibility');
    }
    if (hasField(gig, 'gigCandidateId')) {
      block(gigId, 'legacyGigCandidateIdPresent');
    }

    if (typeof gig.publicId !== 'string' || !gig.publicId.trim()) {
      block(gigId, 'invalidPublicId');
    } else {
      const ids = publicIds.get(gig.publicId) ?? [];
      ids.push(gigId);
      publicIds.set(gig.publicId, ids);
    }

    const userId = resolveUserId(gig, usersByExternalUserId);
    if (userId === null) {
      block(gigId, 'unresolvedOrAmbiguousActiveAdminUser');
      continue;
    }
    if (
      hasField(gig, 'source') &&
      !isDeepStrictEqual(gig.source, buildSource(userId))
    ) {
      block(gigId, 'existingSourceDoesNotMatchResolvedAdminUser');
      continue;
    }

    if (isMigratableStatus(gig.status)) {
      const expectedGigCandidate = buildGigCandidate(gig, userId);
      if (expectedGigCandidate === null) {
        block(gigId, 'invalidMigratableGigPosts');
        continue;
      }
      const actualGigCandidate = gigCandidatesById.get(gigId);
      const backup = backupsById.get(gigId);
      if (actualGigCandidate === undefined) {
        gigCandidatesToCreate.push(expectedGigCandidate);
      } else if (
        backup === undefined ||
        !isExpectedGigCandidate(actualGigCandidate, expectedGigCandidate)
      ) {
        block(gigId, 'gigCandidateCollisionOrMismatch');
      } else {
        alreadyMigratedGigCandidates += 1;
      }
      if (backup === undefined) {
        backupDocumentsToCreate.push(gig);
      } else if (!isDeepStrictEqual(backup.originalGig, gig)) {
        block(gigId, 'backupDoesNotMatchLegacyGig');
      }
      legacyGigsToDelete.push(gig);
      continue;
    }

    if (gig.status === Status.Published) {
      const expectedGig = buildPublishedGig(gig, userId);
      if (expectedGig === null) {
        block(gigId, 'invalidPublishedGigPosts');
        continue;
      }
      publishPostsToConvert += countPublishPosts(gig);
      const backup = backupsById.get(gigId);
      if (backup === undefined) {
        if (!isDeepStrictEqual(gig, expectedGig)) {
          backupDocumentsToCreate.push(gig);
        }
      } else {
        const expectedFromBackup = buildPublishedGig(
          backup.originalGig,
          userId,
        );
        if (
          expectedFromBackup === null ||
          (!isDeepStrictEqual(gig, backup.originalGig) &&
            !isDeepStrictEqual(gig, expectedFromBackup))
        ) {
          block(gigId, 'publishedGigDoesNotMatchBackupOrProjection');
          continue;
        }
      }
      if (
        !isDeepStrictEqual(
          gig,
          backup === undefined
            ? expectedGig
            : buildPublishedGig(backup.originalGig, userId),
        )
      ) {
        publishedGigsToUpdate.push(expectedGig);
      }
    }
  }

  for (const ids of publicIds.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => block(id, 'duplicatePublicId'));
    }
  }

  for (const backup of backupsById.values()) {
    const id = toRecordId(backup._id);
    if (liveGigIds.has(id)) {
      continue;
    }
    const userId = resolveUserId(backup.originalGig, usersByExternalUserId);
    const actualGigCandidate = gigCandidatesById.get(id);
    const expectedGigCandidate =
      userId === null ? null : buildGigCandidate(backup.originalGig, userId);
    if (
      actualGigCandidate === undefined ||
      expectedGigCandidate === null ||
      !isExpectedGigCandidate(actualGigCandidate, expectedGigCandidate)
    ) {
      block(id, 'backupDoesNotHaveExactMigratedGigCandidate');
    } else {
      alreadyMigratedGigCandidates += 1;
    }
  }

  const provenMigrationIds = new Set(backupsById.keys());
  for (const gigCandidate of gigCandidates) {
    if (!provenMigrationIds.has(toRecordId(gigCandidate._id))) {
      block(toRecordId(gigCandidate._id), 'gigCandidateHasNoStage9BackupProof');
    }
  }

  return {
    statusCounts,
    retainedPublishedGigs: statusCounts[Status.Published],
    gigCandidatesToCreate,
    alreadyMigratedGigCandidates,
    legacyGigsToDelete,
    publishedGigsToUpdate,
    publishPostsToConvert,
    backupDocumentsToCreate,
    blockingRecordIds: [...blockingRecordIds].sort(),
    blockingReasons: Object.fromEntries(
      [...blockingReasonsById.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, reasons]) => [id, [...reasons].sort()]),
    ),
  };
}

function snapshot(
  gigs: readonly MigrationDocument[],
  gigCandidates: readonly MigrationDocument[],
  backups: readonly Stage9BackupDocument[],
): Stage9MigrationReport['before'] {
  const statusCounts = createStatusCounts();
  for (const gig of gigs) {
    if (isLegacyStatus(gig.status)) {
      statusCounts[gig.status] += 1;
    }
  }
  return {
    totalGigs: gigs.length,
    statusCounts,
    totalGigCandidates: gigCandidates.length,
    totalBackups: backups.length,
  };
}

export async function runStage9GigCandidateMigration(
  store: Stage9MigrationStore,
  isDryRun: boolean,
  deleteConfirmation: string | undefined,
): Promise<Stage9MigrationReport> {
  const [beforeGigs, beforeGigCandidates, users, beforeBackups] =
    await Promise.all([
      store.readGigs(),
      store.readGigCandidates(),
      store.readUsers(),
      store.readBackups(),
    ]);
  const before = snapshot(beforeGigs, beforeGigCandidates, beforeBackups);
  const analysis = analyze(
    beforeGigs,
    beforeGigCandidates,
    users,
    beforeBackups,
  );
  const canApply = analysis.blockingRecordIds.length === 0;
  let writes = {
    backups: emptyWriteResult(),
    gigCandidates: emptyWriteResult(),
    publishedGigs: emptyWriteResult(),
    legacyGigs: emptyWriteResult(),
  };

  if (!isDryRun && canApply) {
    if (
      analysis.legacyGigsToDelete.length > 0 &&
      deleteConfirmation !== DELETE_CONFIRMATION
    ) {
      throw new Error(
        `Destructive legacy Gig migration requires STAGE_9_DELETE_CONFIRMATION=${DELETE_CONFIRMATION}`,
      );
    }
    writes.backups = await store.backupGigs(analysis.backupDocumentsToCreate);
    if (
      writes.backups.upsertedCount !== analysis.backupDocumentsToCreate.length
    ) {
      throw new Error('Backup write count did not match the migration plan');
    }
    writes.gigCandidates = await store.insertGigCandidates(
      analysis.gigCandidatesToCreate,
    );
    if (
      writes.gigCandidates.upsertedCount !==
      analysis.gigCandidatesToCreate.length
    ) {
      throw new Error(
        'GigCandidate write count did not match the migration plan',
      );
    }
    writes.publishedGigs = await store.updatePublishedGigs(
      analysis.publishedGigsToUpdate,
    );
    if (
      writes.publishedGigs.matchedCount !==
      analysis.publishedGigsToUpdate.length
    ) {
      throw new Error(
        'Published Gig write count did not match the migration plan',
      );
    }
    writes.legacyGigs = await store.deleteMigratedGigs(
      analysis.legacyGigsToDelete.map((gig) => gig._id),
    );
    if (writes.legacyGigs.deletedCount !== analysis.legacyGigsToDelete.length) {
      throw new Error(
        'Legacy Gig delete count did not match the migration plan',
      );
    }
  }

  const [afterGigs, afterGigCandidates, afterBackups] = isDryRun
    ? [beforeGigs, beforeGigCandidates, beforeBackups]
    : await Promise.all([
        store.readGigs(),
        store.readGigCandidates(),
        store.readBackups(),
      ]);
  const after = snapshot(afterGigs, afterGigCandidates, afterBackups);
  const afterAnalysis = isDryRun
    ? analysis
    : analyze(afterGigs, afterGigCandidates, users, afterBackups);
  if (
    !isDryRun &&
    canApply &&
    (afterAnalysis.blockingRecordIds.length > 0 ||
      afterAnalysis.gigCandidatesToCreate.length > 0 ||
      afterAnalysis.legacyGigsToDelete.length > 0 ||
      afterAnalysis.publishedGigsToUpdate.length > 0 ||
      afterAnalysis.backupDocumentsToCreate.length > 0 ||
      MIGRATABLE_STATUSES.some((status) => after.statusCounts[status] > 0) ||
      after.statusCounts[Status.Rejected] > 0 ||
      after.statusCounts[Status.Published] !== analysis.retainedPublishedGigs ||
      after.totalGigCandidates !==
        before.totalGigCandidates + analysis.gigCandidatesToCreate.length ||
      after.totalBackups !==
        before.totalBackups + analysis.backupDocumentsToCreate.length)
  ) {
    throw new Error('GigCandidate migration post-apply invariants failed');
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    before,
    plan: {
      retainedPublishedGigs: analysis.retainedPublishedGigs,
      gigCandidatesToCreate: analysis.gigCandidatesToCreate.length,
      alreadyMigratedGigCandidates: analysis.alreadyMigratedGigCandidates,
      legacyGigsToDelete: analysis.legacyGigsToDelete.length,
      publishedGigsToUpdate: analysis.publishedGigsToUpdate.length,
      publishPostsToConvert: analysis.publishPostsToConvert,
      backupDocumentsToCreate: analysis.backupDocumentsToCreate.length,
      gigCandidateTimestampsDerivedFromLegacyGigObjectIds:
        analysis.gigCandidatesToCreate.length,
    },
    projectedAfter: {
      totalGigs: analysis.retainedPublishedGigs,
      statusCounts: {
        ...createStatusCounts(),
        [Status.Published]: analysis.retainedPublishedGigs,
      },
      totalGigCandidates:
        before.totalGigCandidates + analysis.gigCandidatesToCreate.length,
      totalBackups:
        before.totalBackups + analysis.backupDocumentsToCreate.length,
    },
    writes,
    after,
    blockingRecordIds: analysis.blockingRecordIds,
    blockingReasons: analysis.blockingReasons,
    canApply,
    destructiveApplyConfirmation:
      analysis.legacyGigsToDelete.length > 0
        ? `STAGE_9_DELETE_CONFIRMATION=${DELETE_CONFIRMATION}`
        : null,
    rollback:
      'Restore deleted legacy Gigs from stage9_legacy_gigs_backup before unfreezing writes; retained Published Gig updates are additive and must be reverted only from a verified backup if application rollback requires it.',
  };
}

function createMongoStore(connection: Connection): Stage9MigrationStore {
  const gigs = connection.collection<MigrationDocument>('gigs');
  const gigCandidates =
    connection.collection<MigrationDocument>('gigcandidates');
  const users = connection.collection<MigrationDocument>('users');
  const backups = connection.collection<Stage9BackupDocument>(
    'stage9_legacy_gigs_backup',
  );

  return {
    readGigs: () => gigs.find({}).toArray(),
    readGigCandidates: () => gigCandidates.find({}).toArray(),
    readUsers: () => users.find({}).toArray(),
    readBackups: () => backups.find({ migration: MIGRATION_NAME }).toArray(),
    async backupGigs(documents) {
      if (documents.length === 0) return emptyWriteResult();
      const result = await backups.bulkWrite(
        documents.map((gig) => ({
          updateOne: {
            filter: { _id: gig._id },
            update: {
              $setOnInsert: {
                migration: MIGRATION_NAME,
                originalGig: gig,
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
    async insertGigCandidates(documents) {
      if (documents.length === 0) return emptyWriteResult();
      const result = await gigCandidates.bulkWrite(
        documents.map((gigCandidate) => ({
          updateOne: {
            filter: { _id: gigCandidate._id },
            update: { $setOnInsert: gigCandidate },
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
    async updatePublishedGigs(documents) {
      if (documents.length === 0) return emptyWriteResult();
      const result = await gigs.bulkWrite(
        documents.map((gig) => ({
          replaceOne: {
            filter: { _id: gig._id, status: Status.Published },
            replacement: gig,
          },
        })),
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    },
    async deleteMigratedGigs(ids) {
      if (ids.length === 0) return emptyWriteResult();
      const result = await gigs.deleteMany({
        _id: { $in: ids },
        status: { $in: MIGRATABLE_STATUSES },
      });
      return {
        matchedCount: result.deletedCount,
        modifiedCount: result.deletedCount,
        deletedCount: result.deletedCount,
      };
    },
  };
}

async function verifyMongoTopologyIsInspectable(
  connection: Connection,
): Promise<void> {
  if (connection.db === undefined) {
    throw new Error(
      'Legacy Gig migration apply blocked because the MongoDB topology is unavailable',
    );
  }
  try {
    await connection.db.admin().command({ hello: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Legacy Gig migration apply blocked because the MongoDB topology could not be inspected: ${message}`,
    );
  }
}

export async function up(connection: Connection): Promise<void> {
  const isDryRun = isMigrationDryRun();
  if (!isDryRun) {
    await verifyMongoTopologyIsInspectable(connection);
  }
  const report = await runStage9GigCandidateMigration(
    createMongoStore(connection),
    isDryRun,
    process.env.STAGE_9_DELETE_CONFIRMATION,
  );
  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `GigCandidate migration blocked for record IDs: ${report.blockingRecordIds.join(', ')}`,
    );
  }
  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'The legacy Gig migration is intentionally one-way. Restore the verified backup while writes remain frozen instead of running an automatic down migration.',
    ),
  );
}
