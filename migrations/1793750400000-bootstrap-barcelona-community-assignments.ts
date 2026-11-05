import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const BARCELONA_COUNTRY_ISO = 'ES';
const BARCELONA_COMMUNITY_SLUG = 'barcelona';
const BARCELONA_NAME_TRANSLATION_KEY = 'barcelona.name';
const BARCELONA_TIME_ZONE = 'Europe/Madrid';
const COMMUNITY_TRANSLATION_NAMESPACE = 'community';
const ENGLISH_LOCALE = 'en';

export interface BarcelonaCommunityMigrationDocument {
  _id: unknown;
  countryIso?: unknown;
  slug?: unknown;
  nameTranslationKey?: unknown;
  timeZone?: unknown;
  isActive?: unknown;
}

export interface BarcelonaCommunityInsertDocument {
  _id: Types.ObjectId;
  countryIso: string;
  slug: string;
  nameTranslationKey: string;
  timeZone: string;
  isActive: boolean;
}

export interface BarcelonaTranslationMigrationDocument {
  _id: unknown;
  locale?: unknown;
  namespace?: unknown;
  key?: unknown;
  value?: unknown;
  format?: unknown;
  kind?: unknown;
  isActive?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BarcelonaTranslationInsertDocument {
  _id: Types.ObjectId;
  locale: string;
  namespace: string;
  key: string;
  value: string;
  format: 'plain';
  kind: 'text';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GigAssignmentMigrationDocument {
  _id: unknown;
  communityIds?: unknown;
}

export interface GigCandidateAssignmentMigrationDocument {
  _id: unknown;
  gigDraft?: unknown;
  communityIds?: unknown;
}

export interface BarcelonaCommunityMigrationState {
  communities: BarcelonaCommunityMigrationDocument[];
  translations: BarcelonaTranslationMigrationDocument[];
  gigs: GigAssignmentMigrationDocument[];
  gigCandidates: GigCandidateAssignmentMigrationDocument[];
}

export interface BarcelonaCommunityMigrationWriteResult {
  matchedCount: number;
  modifiedCount: number;
  insertedCount: number;
}

export interface BarcelonaCommunityMigrationStore {
  readState(): Promise<BarcelonaCommunityMigrationState>;
  insertCommunity(
    community: BarcelonaCommunityInsertDocument,
  ): Promise<BarcelonaCommunityMigrationWriteResult>;
  insertEnglishTranslation(
    translation: BarcelonaTranslationInsertDocument,
  ): Promise<BarcelonaCommunityMigrationWriteResult>;
  backfillGigs(
    communityId: Types.ObjectId,
  ): Promise<BarcelonaCommunityMigrationWriteResult>;
  backfillGigCandidates(
    communityId: Types.ObjectId,
  ): Promise<BarcelonaCommunityMigrationWriteResult>;
}

interface AssignmentSnapshot {
  total: number;
  missing: number;
  valid: number;
  blockingRecordIds: string[];
}

interface AssignmentReadResult {
  hasCommunityIds: boolean;
  communityIds: unknown;
}

export interface BarcelonaCommunityMigrationSnapshot {
  communityRecords: number;
  hasExpectedCommunity: boolean;
  translationRecords: number;
  hasExpectedEnglishTranslation: boolean;
  gigs: AssignmentSnapshot;
  gigCandidates: AssignmentSnapshot;
  blockingReasons: string[];
}

export interface BarcelonaCommunityMigrationWrites {
  community: BarcelonaCommunityMigrationWriteResult;
  englishTranslation: BarcelonaCommunityMigrationWriteResult;
  gigs: BarcelonaCommunityMigrationWriteResult;
  gigCandidates: BarcelonaCommunityMigrationWriteResult;
}

export interface BarcelonaCommunityMigrationReport {
  mode: 'dry-run' | 'apply';
  communityId: string;
  before: BarcelonaCommunityMigrationSnapshot;
  projectedAfter: BarcelonaCommunityMigrationSnapshot;
  writes: BarcelonaCommunityMigrationWrites;
  after: BarcelonaCommunityMigrationSnapshot;
  canApply: boolean;
  rollback: string;
}

function toRecordId(value: unknown): string {
  if (value instanceof Types.ObjectId) {
    return value.toHexString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '[invalid-id]';
}

function isSameObjectId(value: unknown, expected: Types.ObjectId): boolean {
  return value instanceof Types.ObjectId && value.equals(expected);
}

function isExpectedCommunity(
  community: BarcelonaCommunityMigrationDocument,
): boolean {
  return (
    community._id instanceof Types.ObjectId &&
    community.countryIso === BARCELONA_COUNTRY_ISO &&
    community.slug === BARCELONA_COMMUNITY_SLUG &&
    community.nameTranslationKey === BARCELONA_NAME_TRANSLATION_KEY &&
    community.timeZone === BARCELONA_TIME_ZONE &&
    community.isActive === true
  );
}

function isExpectedEnglishTranslation(
  translation: BarcelonaTranslationMigrationDocument,
): boolean {
  return (
    translation._id instanceof Types.ObjectId &&
    translation.locale === ENGLISH_LOCALE &&
    translation.namespace === COMMUNITY_TRANSLATION_NAMESPACE &&
    translation.key === BARCELONA_NAME_TRANSLATION_KEY &&
    translation.value === 'Barcelona' &&
    translation.format === 'plain' &&
    translation.kind === 'text' &&
    translation.isActive === true &&
    translation.createdAt instanceof Date &&
    !Number.isNaN(translation.createdAt.getTime()) &&
    translation.updatedAt instanceof Date &&
    !Number.isNaN(translation.updatedAt.getTime())
  );
}

function buildAssignmentSnapshot<T extends { _id: unknown }>(
  documents: readonly T[],
  communityId: Types.ObjectId,
  readAssignment: (document: T) => AssignmentReadResult | null,
): AssignmentSnapshot {
  let missing = 0;
  let valid = 0;
  const blockingRecordIds: string[] = [];

  for (const document of documents) {
    const assignment = readAssignment(document);
    if (assignment === null) {
      blockingRecordIds.push(toRecordId(document._id));
      continue;
    }

    if (!assignment.hasCommunityIds) {
      missing += 1;
      continue;
    }

    if (
      Array.isArray(assignment.communityIds) &&
      assignment.communityIds.length === 1 &&
      isSameObjectId(assignment.communityIds[0], communityId)
    ) {
      valid += 1;
      continue;
    }

    blockingRecordIds.push(toRecordId(document._id));
  }

  return {
    total: documents.length,
    missing,
    valid,
    blockingRecordIds: blockingRecordIds.sort(),
  };
}

function readGigAssignment(
  document: GigAssignmentMigrationDocument,
): AssignmentReadResult {
  return {
    hasCommunityIds: Object.prototype.hasOwnProperty.call(
      document,
      'communityIds',
    ),
    communityIds: document.communityIds,
  };
}

function readGigCandidateAssignment(
  document: GigCandidateAssignmentMigrationDocument,
): AssignmentReadResult | null {
  if (
    Object.prototype.hasOwnProperty.call(document, 'communityIds') ||
    !isRecord(document.gigDraft)
  ) {
    return null;
  }

  return {
    hasCommunityIds: Object.prototype.hasOwnProperty.call(
      document.gigDraft,
      'communityIds',
    ),
    communityIds: document.gigDraft.communityIds,
  };
}

function buildSnapshot(
  state: BarcelonaCommunityMigrationState,
  communityId: Types.ObjectId,
): BarcelonaCommunityMigrationSnapshot {
  const blockingReasons: string[] = [];
  const community = state.communities[0];
  const translation = state.translations[0];

  if (state.communities.length > 1) {
    blockingReasons.push('Multiple Barcelona Community records exist.');
  } else if (community !== undefined && !isExpectedCommunity(community)) {
    blockingReasons.push(
      'The existing Barcelona Community does not match the expected record.',
    );
  }

  if (state.translations.length > 1) {
    blockingReasons.push(
      'Multiple English Barcelona Community translations exist.',
    );
  } else if (
    translation !== undefined &&
    !isExpectedEnglishTranslation(translation)
  ) {
    blockingReasons.push(
      'The existing English Barcelona Community translation does not match the expected record.',
    );
  }

  const gigs = buildAssignmentSnapshot(
    state.gigs,
    communityId,
    readGigAssignment,
  );
  const gigCandidates = buildAssignmentSnapshot(
    state.gigCandidates,
    communityId,
    readGigCandidateAssignment,
  );
  if (gigs.blockingRecordIds.length > 0) {
    blockingReasons.push('Some Gigs have conflicting Community assignments.');
  }
  if (gigCandidates.blockingRecordIds.length > 0) {
    blockingReasons.push(
      'Some GigCandidates have invalid or conflicting Community assignments.',
    );
  }

  return {
    communityRecords: state.communities.length,
    hasExpectedCommunity:
      community !== undefined && isExpectedCommunity(community),
    translationRecords: state.translations.length,
    hasExpectedEnglishTranslation:
      translation !== undefined && isExpectedEnglishTranslation(translation),
    gigs,
    gigCandidates,
    blockingReasons,
  };
}

function projectState(
  state: BarcelonaCommunityMigrationState,
  communityId: Types.ObjectId,
  now: Date,
): BarcelonaCommunityMigrationState {
  const communities =
    state.communities.length === 0
      ? [createCommunityDocument(communityId)]
      : state.communities;
  const translations =
    state.translations.length === 0
      ? [createEnglishTranslationDocument(new Types.ObjectId(), now)]
      : state.translations;

  return {
    communities,
    translations,
    gigs: state.gigs.map((document) =>
      addGigAssignmentsWhenMissing(document, communityId),
    ),
    gigCandidates: state.gigCandidates.map((document) =>
      addGigCandidateAssignmentsWhenMissing(document, communityId),
    ),
  };
}

function addGigAssignmentsWhenMissing(
  document: GigAssignmentMigrationDocument,
  communityId: Types.ObjectId,
): GigAssignmentMigrationDocument {
  const hasCommunityIds = Object.prototype.hasOwnProperty.call(
    document,
    'communityIds',
  );
  if (hasCommunityIds) {
    return document;
  }
  return {
    ...document,
    communityIds: [communityId],
  };
}

function addGigCandidateAssignmentsWhenMissing(
  document: GigCandidateAssignmentMigrationDocument,
  communityId: Types.ObjectId,
): GigCandidateAssignmentMigrationDocument {
  if (
    Object.prototype.hasOwnProperty.call(document, 'communityIds') ||
    !isRecord(document.gigDraft) ||
    Object.prototype.hasOwnProperty.call(document.gigDraft, 'communityIds')
  ) {
    return document;
  }

  return {
    ...document,
    gigDraft: {
      ...document.gigDraft,
      communityIds: [communityId],
    },
  };
}

function createCommunityDocument(
  communityId: Types.ObjectId,
): BarcelonaCommunityInsertDocument {
  return {
    _id: communityId,
    countryIso: BARCELONA_COUNTRY_ISO,
    slug: BARCELONA_COMMUNITY_SLUG,
    nameTranslationKey: BARCELONA_NAME_TRANSLATION_KEY,
    timeZone: BARCELONA_TIME_ZONE,
    isActive: true,
  };
}

function createEnglishTranslationDocument(
  translationId: Types.ObjectId,
  now: Date,
): BarcelonaTranslationInsertDocument {
  return {
    _id: translationId,
    locale: ENGLISH_LOCALE,
    namespace: COMMUNITY_TRANSLATION_NAMESPACE,
    key: BARCELONA_NAME_TRANSLATION_KEY,
    value: 'Barcelona',
    format: 'plain',
    kind: 'text',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function emptyWriteResult(): BarcelonaCommunityMigrationWriteResult {
  return { matchedCount: 0, modifiedCount: 0, insertedCount: 0 };
}

function isSnapshotComplete(
  snapshot: BarcelonaCommunityMigrationSnapshot,
): boolean {
  return (
    snapshot.blockingReasons.length === 0 &&
    snapshot.communityRecords === 1 &&
    snapshot.hasExpectedCommunity &&
    snapshot.translationRecords === 1 &&
    snapshot.hasExpectedEnglishTranslation &&
    snapshot.gigs.missing === 0 &&
    snapshot.gigs.valid === snapshot.gigs.total &&
    snapshot.gigCandidates.missing === 0 &&
    snapshot.gigCandidates.valid === snapshot.gigCandidates.total
  );
}

export async function runBarcelonaCommunityMigration(
  store: BarcelonaCommunityMigrationStore,
  isDryRun: boolean,
  now = new Date(),
): Promise<BarcelonaCommunityMigrationReport> {
  const beforeState = await store.readState();
  const existingCommunity = beforeState.communities[0];
  const communityId =
    existingCommunity?._id instanceof Types.ObjectId
      ? existingCommunity._id
      : new Types.ObjectId();
  const before = buildSnapshot(beforeState, communityId);
  const projectedAfter = buildSnapshot(
    projectState(beforeState, communityId, now),
    communityId,
  );
  const canApply =
    before.blockingReasons.length === 0 && isSnapshotComplete(projectedAfter);

  const writes: BarcelonaCommunityMigrationWrites = {
    community: emptyWriteResult(),
    englishTranslation: emptyWriteResult(),
    gigs: emptyWriteResult(),
    gigCandidates: emptyWriteResult(),
  };

  if (!isDryRun && canApply) {
    if (beforeState.communities.length === 0) {
      writes.community = await store.insertCommunity(
        createCommunityDocument(communityId),
      );
    }
    if (beforeState.translations.length === 0) {
      writes.englishTranslation = await store.insertEnglishTranslation(
        createEnglishTranslationDocument(new Types.ObjectId(), now),
      );
    }
    writes.gigs = await store.backfillGigs(communityId);
    writes.gigCandidates = await store.backfillGigCandidates(communityId);
  }

  const afterState = isDryRun ? beforeState : await store.readState();
  const after = buildSnapshot(afterState, communityId);
  if (!isDryRun && canApply && !isSnapshotComplete(after)) {
    throw new Error(
      'Barcelona Community migration post-apply invariants failed',
    );
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    communityId: communityId.toHexString(),
    before,
    projectedAfter,
    writes,
    after,
    canApply,
    rollback:
      'One-way bootstrap and relationship backfill. Restore from a verified backup before removing Community assignments after application writes begin.',
  };
}

function createMongoStore(
  connection: Connection,
): BarcelonaCommunityMigrationStore {
  const communities = connection.collection('communities');
  const translations = connection.collection('translations');
  const gigs = connection.collection('gigs');
  const gigCandidates = connection.collection('gigcandidates');

  return {
    async readState(): Promise<BarcelonaCommunityMigrationState> {
      const [communityRows, translationRows, gigRows, gigCandidateRows] =
        await Promise.all([
          communities
            .find({
              countryIso: BARCELONA_COUNTRY_ISO,
              slug: BARCELONA_COMMUNITY_SLUG,
            })
            .toArray(),
          translations
            .find({
              locale: ENGLISH_LOCALE,
              namespace: COMMUNITY_TRANSLATION_NAMESPACE,
              key: BARCELONA_NAME_TRANSLATION_KEY,
            })
            .toArray(),
          gigs
            .find(
              {},
              {
                projection: {
                  _id: 1,
                  communityIds: 1,
                },
              },
            )
            .toArray(),
          gigCandidates
            .find(
              {},
              {
                projection: {
                  _id: 1,
                  gigDraft: 1,
                  communityIds: 1,
                },
              },
            )
            .toArray(),
        ]);

      return {
        communities: communityRows,
        translations: translationRows,
        gigs: gigRows,
        gigCandidates: gigCandidateRows,
      };
    },
    async insertCommunity(community) {
      await communities.insertOne(community);
      return { matchedCount: 0, modifiedCount: 0, insertedCount: 1 };
    },
    async insertEnglishTranslation(translation) {
      await translations.insertOne(translation);
      return { matchedCount: 0, modifiedCount: 0, insertedCount: 1 };
    },
    async backfillGigs(communityId) {
      const result = await gigs.updateMany(
        {
          communityIds: { $exists: false },
        },
        {
          $set: {
            communityIds: [communityId],
          },
        },
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        insertedCount: 0,
      };
    },
    async backfillGigCandidates(communityId) {
      const result = await gigCandidates.updateMany(
        {
          gigDraft: { $type: 'object' },
          'gigDraft.communityIds': { $exists: false },
          communityIds: { $exists: false },
        },
        {
          $set: {
            'gigDraft.communityIds': [communityId],
          },
        },
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        insertedCount: 0,
      };
    },
  };
}

export async function up(connection: Connection): Promise<void> {
  const isDryRun = isMigrationDryRun();
  const report = await runBarcelonaCommunityMigration(
    createMongoStore(connection),
    isDryRun,
  );

  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Barcelona Community migration blocked: ${report.before.blockingReasons.join(' ')}`,
    );
  }

  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'This migration is intentionally one-way; removing Community assignments after application writes begin is unsafe.',
    ),
  );
}
