import type { Connection } from 'mongoose';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const GIGS_COLLECTION = 'gigs';
const GIG_CANDIDATES_COLLECTION = 'gigcandidates';
const USERS_COLLECTION = 'users';
const LEGACY_ADMINS_COLLECTION = 'admins';
const TRANSLATIONS_COLLECTION = 'translations';
const TELEGRAM_NAMESPACE = 'telegram';
const OBSOLETE_TELEGRAM_TRANSLATION_KEYS = [
  'submissionFeedback',
  'status.pending',
  'status.published',
  'status.rejected',
  'status.accepted',
  'button.accept',
] as const;

export interface ObsoleteGigWorkflowGigDocument {
  _id: unknown;
  source?: unknown;
  status?: unknown;
  suggestedBy?: unknown;
  gigCandidateId?: unknown;
}

export interface ObsoleteGigWorkflowGigCandidateDocument {
  _id: unknown;
  source?: unknown;
  status?: unknown;
  gigId?: unknown;
  suggestedBy?: unknown;
  feedbackMessageId?: unknown;
}

export interface ObsoleteGigWorkflowUserDocument {
  _id: unknown;
  status?: unknown;
  roles?: unknown;
  identities?: unknown;
}

export interface ObsoleteGigWorkflowLegacyAdminDocument {
  _id: unknown;
  telegramId?: unknown;
  isActive?: unknown;
}

export interface ObsoleteGigWorkflowTranslationDocument {
  _id: unknown;
  namespace?: unknown;
  key?: unknown;
}

export interface ObsoleteGigWorkflowGigIndex {
  name: string;
  key: Record<string, unknown>;
  collationLocale?: unknown;
  collationStrength?: unknown;
}

export interface ObsoleteGigWorkflowState {
  gigs: ObsoleteGigWorkflowGigDocument[];
  gigCandidates: ObsoleteGigWorkflowGigCandidateDocument[];
  users: ObsoleteGigWorkflowUserDocument[];
  hasLegacyAdminsCollection: boolean;
  legacyAdmins: ObsoleteGigWorkflowLegacyAdminDocument[];
  obsoleteTranslations: ObsoleteGigWorkflowTranslationDocument[];
  gigIndexes: ObsoleteGigWorkflowGigIndex[];
}

export interface ObsoleteGigWorkflowWriteCount {
  matchedCount: number;
  modifiedCount: number;
}

export interface ObsoleteGigWorkflowWrites {
  gigFields: ObsoleteGigWorkflowWriteCount;
  deletedTranslations: number;
  legacyAdminsCollectionDropped: boolean;
  droppedGigIndexes: string[];
}

export interface ObsoleteGigWorkflowMigrationStore {
  readState(): Promise<ObsoleteGigWorkflowState>;
  removeLegacyGigFields(): Promise<ObsoleteGigWorkflowWriteCount>;
  deleteObsoleteTranslations(): Promise<number>;
  dropLegacyAdminsCollection(): Promise<boolean>;
  dropGigIndexes(indexNames: string[]): Promise<string[]>;
}

export interface ObsoleteGigWorkflowSnapshot {
  gigDocuments: number;
  gigCandidateDocuments: number;
  invalidGigSourceIds: string[];
  gigsWithSuggestedBy: number;
  gigsWithStatus: number;
  gigsWithGigCandidateId: number;
  gigDocumentsWithObsoleteFields: number;
  nonPublishedLegacyGigStatusIds: string[];
  invalidGigCandidateRelationshipIds: string[];
  gigCandidatesWithObsoleteFields: string[];
  approvedGigCandidates: number;
  rejectedGigCandidates: number;
  gigCandidatesWithOriginalText: number;
  gigCandidatesWithAttachments: number;
  legacyAdminsCollectionExists: boolean;
  legacyAdminDocuments: number;
  activeLegacyAdmins: number;
  activeAdminUsers: number;
  invalidLegacyAdminIds: string[];
  unmatchedActiveLegacyAdminIds: string[];
  ambiguousActiveLegacyAdminIds: string[];
  obsoleteTranslationDocuments: number;
  obsoleteGigIndexNames: string[];
  hasRequiredVisibleFeedIndex: boolean;
  blockingRecordIds: string[];
}

export interface ObsoleteGigWorkflowPlannedWrites {
  gigDocuments: number;
  translationDocuments: number;
  legacyAdminDocuments: number;
  legacyAdminsCollection: number;
  gigIndexes: string[];
}

export interface ObsoleteGigWorkflowMigrationReport {
  mode: 'dry-run' | 'apply';
  before: ObsoleteGigWorkflowSnapshot;
  plannedWrites: ObsoleteGigWorkflowPlannedWrites;
  writes: ObsoleteGigWorkflowWrites;
  projectedAfter: ObsoleteGigWorkflowSnapshot;
  after: ObsoleteGigWorkflowSnapshot;
  canApply: boolean;
  rollback: string;
}

function hasField(value: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowedKeys = new Set(keys);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toRecordId(value: unknown): string {
  return String(value);
}

function normalizeObjectId(value: unknown): string | undefined {
  const normalized = String(value).trim().toLowerCase();
  return /^[0-9a-f]{24}$/.test(normalized) ? normalized : undefined;
}

function isValidGigSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'user') {
    if (
      !hasOnlyKeys(value, ['type', 'userId', 'origin']) ||
      normalizeObjectId(value.userId) === undefined ||
      !isRecord(value.origin)
    ) {
      return false;
    }

    return (
      hasOnlyKeys(value.origin, ['type']) &&
      (value.origin.type === 'form' ||
        value.origin.type === 'admin' ||
        value.origin.type === 'messenger')
    );
  }

  if (value.type !== 'provider' || !isRecord(value.provider)) {
    return false;
  }

  const provider = value.provider;
  return (
    hasOnlyKeys(value, ['type', 'provider']) &&
    hasOnlyKeys(provider, [
      'name',
      'externalEventId',
      'externalVersionId',
      'sourceUrl',
      'fetchedAt',
      'providerUpdatedAt',
    ]) &&
    typeof provider.name === 'string' &&
    provider.name.trim() !== '' &&
    typeof provider.externalEventId === 'string' &&
    provider.externalEventId.trim() !== '' &&
    (provider.externalVersionId === undefined ||
      typeof provider.externalVersionId === 'string') &&
    typeof provider.sourceUrl === 'string' &&
    provider.sourceUrl.trim() !== '' &&
    isValidDate(provider.fetchedAt) &&
    (provider.providerUpdatedAt === undefined ||
      isValidDate(provider.providerUpdatedAt))
  );
}

function isKnownGigCandidateStatus(value: unknown): boolean {
  return (
    value === 'New' ||
    value === 'Reviewing' ||
    value === 'Approved' ||
    value === 'Rejected'
  );
}

function isExactIndexKey(
  key: Record<string, unknown>,
  expected: Record<string, number>,
): boolean {
  const entries = Object.entries(key);
  const expectedEntries = Object.entries(expected);
  return (
    entries.length === expectedEntries.length &&
    expectedEntries.every(([field, direction]) => key[field] === direction)
  );
}

function isRequiredVisibleFeedIndex(
  index: ObsoleteGigWorkflowGigIndex,
): boolean {
  return (
    isExactIndexKey(index.key, {
      isVisible: 1,
      country: 1,
      city: 1,
      date: 1,
      _id: 1,
    }) &&
    index.collationLocale === 'en' &&
    index.collationStrength === 2
  );
}

function isObsoleteGigIndex(index: ObsoleteGigWorkflowGigIndex): boolean {
  return (
    hasField(index.key, 'status') ||
    hasField(index.key, 'gigCandidateId') ||
    isExactIndexKey(index.key, { country: 1, city: 1 })
  );
}

function buildActiveAdminUsersByTelegramId(
  users: readonly ObsoleteGigWorkflowUserDocument[],
): Map<string, string[]> {
  const usersByTelegramId = new Map<string, string[]>();
  for (const user of users) {
    if (
      user.status !== 'active' ||
      !Array.isArray(user.roles) ||
      !user.roles.includes('admin') ||
      !Array.isArray(user.identities)
    ) {
      continue;
    }

    const userId = normalizeObjectId(user._id);
    if (!userId) {
      continue;
    }

    for (const identity of user.identities) {
      if (
        !isRecord(identity) ||
        identity.type !== 'messenger' ||
        identity.messenger !== 'Telegram' ||
        typeof identity.externalUserId !== 'string' ||
        identity.externalUserId.trim() === ''
      ) {
        continue;
      }

      const externalUserId = identity.externalUserId.trim();
      const matches = usersByTelegramId.get(externalUserId) ?? [];
      matches.push(userId);
      usersByTelegramId.set(externalUserId, matches);
    }
  }
  return usersByTelegramId;
}

export function buildObsoleteGigWorkflowSnapshot(
  state: ObsoleteGigWorkflowState,
): ObsoleteGigWorkflowSnapshot {
  const invalidGigSourceIds: string[] = [];
  const nonPublishedLegacyGigStatusIds: string[] = [];
  const invalidGigCandidateRelationshipIds = new Set<string>();
  const gigCandidatesWithObsoleteFields: string[] = [];
  const invalidLegacyAdminIds: string[] = [];
  const unmatchedActiveLegacyAdminIds: string[] = [];
  const ambiguousActiveLegacyAdminIds: string[] = [];
  const gigIds = new Set<string>();
  const gigCandidateByGigId = new Map<string, string>();
  const gigCandidateIdToGigId = new Map<string, string>();
  let gigsWithSuggestedBy = 0;
  let gigsWithStatus = 0;
  let gigsWithGigCandidateId = 0;
  let gigDocumentsWithObsoleteFields = 0;
  let approvedGigCandidates = 0;
  let rejectedGigCandidates = 0;
  let gigCandidatesWithOriginalText = 0;
  let gigCandidatesWithAttachments = 0;

  for (const gig of state.gigs) {
    const gigId = normalizeObjectId(gig._id);
    if (gigId) {
      gigIds.add(gigId);
    }
    if (!isValidGigSource(gig.source)) {
      invalidGigSourceIds.push(toRecordId(gig._id));
    }

    const hasSuggestedBy = hasField(gig, 'suggestedBy');
    const hasStatus = hasField(gig, 'status');
    const hasGigCandidateId = hasField(gig, 'gigCandidateId');
    gigsWithSuggestedBy += hasSuggestedBy ? 1 : 0;
    gigsWithStatus += hasStatus ? 1 : 0;
    gigsWithGigCandidateId += hasGigCandidateId ? 1 : 0;
    gigDocumentsWithObsoleteFields +=
      hasSuggestedBy || hasStatus || hasGigCandidateId ? 1 : 0;
    if (hasStatus && gig.status !== 'Published') {
      nonPublishedLegacyGigStatusIds.push(toRecordId(gig._id));
    }
  }

  for (const gigCandidate of state.gigCandidates) {
    const gigCandidateId = normalizeObjectId(gigCandidate._id);
    const recordId = toRecordId(gigCandidate._id);
    const hasGigId = hasField(gigCandidate, 'gigId');
    const gigId = hasGigId ? normalizeObjectId(gigCandidate.gigId) : undefined;

    if (!isKnownGigCandidateStatus(gigCandidate.status)) {
      invalidGigCandidateRelationshipIds.add(recordId);
    } else if (gigCandidate.status === 'Approved') {
      approvedGigCandidates += 1;
      if (!gigId || !gigCandidateId) {
        invalidGigCandidateRelationshipIds.add(recordId);
      }
    } else {
      if (gigCandidate.status === 'Rejected') {
        rejectedGigCandidates += 1;
      }
      if (hasGigId) {
        invalidGigCandidateRelationshipIds.add(recordId);
      }
    }

    if (
      hasField(gigCandidate, 'suggestedBy') ||
      hasField(gigCandidate, 'feedbackMessageId')
    ) {
      gigCandidatesWithObsoleteFields.push(recordId);
    }

    if (isRecord(gigCandidate.source)) {
      gigCandidatesWithOriginalText += hasField(
        gigCandidate.source,
        'originalText',
      )
        ? 1
        : 0;
      gigCandidatesWithAttachments += hasField(
        gigCandidate.source,
        'attachments',
      )
        ? 1
        : 0;
    }

    if (gigCandidateId && gigId) {
      if (gigCandidateByGigId.has(gigId)) {
        invalidGigCandidateRelationshipIds.add(recordId);
        const existingGigCandidateId = gigCandidateByGigId.get(gigId);
        if (existingGigCandidateId) {
          invalidGigCandidateRelationshipIds.add(existingGigCandidateId);
        }
      } else {
        gigCandidateByGigId.set(gigId, gigCandidateId);
      }
      gigCandidateIdToGigId.set(gigCandidateId, gigId);
      if (!gigIds.has(gigId)) {
        invalidGigCandidateRelationshipIds.add(recordId);
      }
    }
  }

  for (const gig of state.gigs) {
    if (!hasField(gig, 'gigCandidateId')) {
      continue;
    }
    const gigId = normalizeObjectId(gig._id);
    const gigCandidateId = normalizeObjectId(gig.gigCandidateId);
    const expectedGigId = gigCandidateId
      ? gigCandidateIdToGigId.get(gigCandidateId)
      : undefined;
    if (!gigId || !gigCandidateId || expectedGigId !== gigId) {
      invalidGigCandidateRelationshipIds.add(toRecordId(gig._id));
    }
  }

  const usersByTelegramId = buildActiveAdminUsersByTelegramId(state.users);
  const activeAdminUserIds = new Set(
    [...usersByTelegramId.values()].flatMap((userIds) => userIds),
  );
  let activeLegacyAdmins = 0;
  const activeLegacyTelegramIds = new Set<string>();
  for (const legacyAdmin of state.legacyAdmins) {
    const recordId = toRecordId(legacyAdmin._id);
    if (
      typeof legacyAdmin.telegramId !== 'number' ||
      !Number.isSafeInteger(legacyAdmin.telegramId) ||
      typeof legacyAdmin.isActive !== 'boolean'
    ) {
      invalidLegacyAdminIds.push(recordId);
      continue;
    }
    if (!legacyAdmin.isActive) {
      continue;
    }

    activeLegacyAdmins += 1;
    const externalUserId = String(legacyAdmin.telegramId);
    if (activeLegacyTelegramIds.has(externalUserId)) {
      ambiguousActiveLegacyAdminIds.push(recordId);
      continue;
    }
    activeLegacyTelegramIds.add(externalUserId);
    const matches = usersByTelegramId.get(externalUserId) ?? [];
    if (matches.length === 0) {
      unmatchedActiveLegacyAdminIds.push(recordId);
    } else if (matches.length > 1) {
      ambiguousActiveLegacyAdminIds.push(recordId);
    }
  }

  const obsoleteGigIndexNames = state.gigIndexes
    .filter(isObsoleteGigIndex)
    .map((index) => index.name)
    .sort();
  const blockingRecordIds = [
    ...invalidGigSourceIds,
    ...nonPublishedLegacyGigStatusIds,
    ...invalidGigCandidateRelationshipIds,
    ...gigCandidatesWithObsoleteFields,
    ...invalidLegacyAdminIds,
    ...unmatchedActiveLegacyAdminIds,
    ...ambiguousActiveLegacyAdminIds,
  ];

  return {
    gigDocuments: state.gigs.length,
    gigCandidateDocuments: state.gigCandidates.length,
    invalidGigSourceIds: [...invalidGigSourceIds].sort(),
    gigsWithSuggestedBy,
    gigsWithStatus,
    gigsWithGigCandidateId,
    gigDocumentsWithObsoleteFields,
    nonPublishedLegacyGigStatusIds: [...nonPublishedLegacyGigStatusIds].sort(),
    invalidGigCandidateRelationshipIds: [
      ...invalidGigCandidateRelationshipIds,
    ].sort(),
    gigCandidatesWithObsoleteFields: [
      ...gigCandidatesWithObsoleteFields,
    ].sort(),
    approvedGigCandidates,
    rejectedGigCandidates,
    gigCandidatesWithOriginalText,
    gigCandidatesWithAttachments,
    legacyAdminsCollectionExists: state.hasLegacyAdminsCollection,
    legacyAdminDocuments: state.legacyAdmins.length,
    activeLegacyAdmins,
    activeAdminUsers: activeAdminUserIds.size,
    invalidLegacyAdminIds: [...invalidLegacyAdminIds].sort(),
    unmatchedActiveLegacyAdminIds: [...unmatchedActiveLegacyAdminIds].sort(),
    ambiguousActiveLegacyAdminIds: [...ambiguousActiveLegacyAdminIds].sort(),
    obsoleteTranslationDocuments: state.obsoleteTranslations.length,
    obsoleteGigIndexNames,
    hasRequiredVisibleFeedIndex: state.gigIndexes.some(
      isRequiredVisibleFeedIndex,
    ),
    blockingRecordIds: [...new Set(blockingRecordIds)].sort(),
  };
}

function projectCleanup(
  state: ObsoleteGigWorkflowState,
): ObsoleteGigWorkflowState {
  return {
    gigs: state.gigs.map((gig) => {
      const projected: ObsoleteGigWorkflowGigDocument = { ...gig };
      delete projected.suggestedBy;
      delete projected.status;
      delete projected.gigCandidateId;
      return projected;
    }),
    gigCandidates: state.gigCandidates.map((gigCandidate) => ({
      ...gigCandidate,
    })),
    users: state.users.map((user) => ({ ...user })),
    hasLegacyAdminsCollection: false,
    legacyAdmins: [],
    obsoleteTranslations: [],
    gigIndexes: state.gigIndexes
      .filter((index) => !isObsoleteGigIndex(index))
      .map((index) => ({ ...index, key: { ...index.key } })),
  };
}

function isCleanupComplete(snapshot: ObsoleteGigWorkflowSnapshot): boolean {
  return (
    snapshot.invalidGigSourceIds.length === 0 &&
    snapshot.gigDocumentsWithObsoleteFields === 0 &&
    snapshot.nonPublishedLegacyGigStatusIds.length === 0 &&
    snapshot.invalidGigCandidateRelationshipIds.length === 0 &&
    snapshot.gigCandidatesWithObsoleteFields.length === 0 &&
    !snapshot.legacyAdminsCollectionExists &&
    snapshot.legacyAdminDocuments === 0 &&
    snapshot.obsoleteTranslationDocuments === 0 &&
    snapshot.obsoleteGigIndexNames.length === 0 &&
    snapshot.hasRequiredVisibleFeedIndex &&
    snapshot.blockingRecordIds.length === 0
  );
}

function emptyWrites(): ObsoleteGigWorkflowWrites {
  return {
    gigFields: { matchedCount: 0, modifiedCount: 0 },
    deletedTranslations: 0,
    legacyAdminsCollectionDropped: false,
    droppedGigIndexes: [],
  };
}

export async function runObsoleteGigWorkflowCleanup(
  store: ObsoleteGigWorkflowMigrationStore,
  isDryRun: boolean,
): Promise<ObsoleteGigWorkflowMigrationReport> {
  const beforeState = await store.readState();
  const before = buildObsoleteGigWorkflowSnapshot(beforeState);
  const plannedWrites: ObsoleteGigWorkflowPlannedWrites = {
    gigDocuments: before.gigDocumentsWithObsoleteFields,
    translationDocuments: before.obsoleteTranslationDocuments,
    legacyAdminDocuments: before.legacyAdminDocuments,
    legacyAdminsCollection: before.legacyAdminsCollectionExists ? 1 : 0,
    gigIndexes: [...before.obsoleteGigIndexNames],
  };
  const projectedAfter = buildObsoleteGigWorkflowSnapshot(
    projectCleanup(beforeState),
  );
  const canApply =
    before.blockingRecordIds.length === 0 &&
    before.hasRequiredVisibleFeedIndex &&
    isCleanupComplete(projectedAfter);
  const writes = emptyWrites();

  if (!isDryRun && canApply) {
    if (plannedWrites.gigDocuments > 0) {
      writes.gigFields = await store.removeLegacyGigFields();
      if (
        writes.gigFields.matchedCount !== plannedWrites.gigDocuments ||
        writes.gigFields.modifiedCount !== plannedWrites.gigDocuments
      ) {
        throw new Error(
          `Obsolete Gig field cleanup expected ${plannedWrites.gigDocuments} documents but matched ${writes.gigFields.matchedCount} and modified ${writes.gigFields.modifiedCount}`,
        );
      }
    }

    if (plannedWrites.translationDocuments > 0) {
      writes.deletedTranslations = await store.deleteObsoleteTranslations();
      if (writes.deletedTranslations !== plannedWrites.translationDocuments) {
        throw new Error(
          `Obsolete Telegram translation cleanup expected ${plannedWrites.translationDocuments} deletions but deleted ${writes.deletedTranslations}`,
        );
      }
    }

    if (plannedWrites.gigIndexes.length > 0) {
      writes.droppedGigIndexes = await store.dropGigIndexes(
        plannedWrites.gigIndexes,
      );
      if (writes.droppedGigIndexes.length !== plannedWrites.gigIndexes.length) {
        throw new Error(
          `Obsolete Gig index cleanup expected ${plannedWrites.gigIndexes.length} drops but dropped ${writes.droppedGigIndexes.length}`,
        );
      }
    }

    if (plannedWrites.legacyAdminsCollection > 0) {
      writes.legacyAdminsCollectionDropped =
        await store.dropLegacyAdminsCollection();
      if (!writes.legacyAdminsCollectionDropped) {
        throw new Error('Legacy admins collection was not dropped');
      }
    }
  }

  const afterState = isDryRun ? beforeState : await store.readState();
  const after = buildObsoleteGigWorkflowSnapshot(afterState);
  if (!isDryRun && canApply && !isCleanupComplete(after)) {
    throw new Error(
      'Obsolete Gig workflow cleanup post-apply invariants failed',
    );
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    before,
    plannedWrites,
    writes,
    projectedAfter,
    after,
    canApply,
    rollback:
      'Restore removed Gig fields, Telegram translations, the admins collection, and dropped Gig indexes from the operator-verified backup. Do not reconstruct deleted values from current User or GigCandidate data.',
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
): ObsoleteGigWorkflowMigrationStore {
  const database = requireDatabase(connection);

  async function collectionExists(collectionName: string): Promise<boolean> {
    return database
      .listCollections({ name: collectionName }, { nameOnly: true })
      .hasNext();
  }

  return {
    async readState(): Promise<ObsoleteGigWorkflowState> {
      const hasLegacyAdminsCollection = await collectionExists(
        LEGACY_ADMINS_COLLECTION,
      );
      const [
        gigs,
        gigCandidates,
        users,
        legacyAdmins,
        obsoleteTranslations,
        rawGigIndexes,
      ] = await Promise.all([
        database
          .collection(GIGS_COLLECTION)
          .find(
            {},
            {
              projection: {
                _id: 1,
                source: 1,
                status: 1,
                suggestedBy: 1,
                gigCandidateId: 1,
              },
            },
          )
          .toArray(),
        database
          .collection(GIG_CANDIDATES_COLLECTION)
          .find(
            {},
            {
              projection: {
                _id: 1,
                source: 1,
                status: 1,
                gigId: 1,
                suggestedBy: 1,
                feedbackMessageId: 1,
              },
            },
          )
          .toArray(),
        database
          .collection(USERS_COLLECTION)
          .find(
            {},
            {
              projection: { _id: 1, status: 1, roles: 1, identities: 1 },
            },
          )
          .toArray(),
        hasLegacyAdminsCollection
          ? database
              .collection(LEGACY_ADMINS_COLLECTION)
              .find({}, { projection: { _id: 1, telegramId: 1, isActive: 1 } })
              .toArray()
          : Promise.resolve([]),
        database
          .collection(TRANSLATIONS_COLLECTION)
          .find(
            {
              namespace: TELEGRAM_NAMESPACE,
              key: { $in: [...OBSOLETE_TELEGRAM_TRANSLATION_KEYS] },
            },
            { projection: { _id: 1, namespace: 1, key: 1 } },
          )
          .toArray(),
        database.collection(GIGS_COLLECTION).indexes(),
      ]);

      const gigIndexes: ObsoleteGigWorkflowGigIndex[] = rawGigIndexes.map(
        (index) => {
          if (!index.name) {
            throw new Error('Gig index without a name cannot be audited');
          }
          const key: Record<string, unknown> = {};
          for (const [field, direction] of Object.entries(index.key)) {
            key[field] = direction;
          }
          const collation = isRecord(index.collation)
            ? index.collation
            : undefined;
          return {
            name: index.name,
            key,
            ...(collation
              ? {
                  collationLocale: collation.locale,
                  collationStrength: collation.strength,
                }
              : {}),
          };
        },
      );

      return {
        gigs,
        gigCandidates,
        users,
        hasLegacyAdminsCollection,
        legacyAdmins,
        obsoleteTranslations,
        gigIndexes,
      };
    },
    async removeLegacyGigFields(): Promise<ObsoleteGigWorkflowWriteCount> {
      const result = await database.collection(GIGS_COLLECTION).updateMany(
        {
          $or: [
            { suggestedBy: { $exists: true } },
            { status: { $exists: true } },
            { gigCandidateId: { $exists: true } },
          ],
        },
        { $unset: { suggestedBy: '', status: '', gigCandidateId: '' } },
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    },
    async deleteObsoleteTranslations(): Promise<number> {
      const result = await database
        .collection(TRANSLATIONS_COLLECTION)
        .deleteMany({
          namespace: TELEGRAM_NAMESPACE,
          key: { $in: [...OBSOLETE_TELEGRAM_TRANSLATION_KEYS] },
        });
      return result.deletedCount;
    },
    async dropLegacyAdminsCollection(): Promise<boolean> {
      if (!(await collectionExists(LEGACY_ADMINS_COLLECTION))) {
        return false;
      }
      return database.collection(LEGACY_ADMINS_COLLECTION).drop();
    },
    async dropGigIndexes(indexNames: string[]): Promise<string[]> {
      const droppedIndexNames: string[] = [];
      for (const indexName of indexNames) {
        await database.collection(GIGS_COLLECTION).dropIndex(indexName);
        droppedIndexNames.push(indexName);
      }
      return droppedIndexNames;
    },
  };
}

export async function up(connection: Connection): Promise<void> {
  const isDryRun = isMigrationDryRun();
  const report = await runObsoleteGigWorkflowCleanup(
    createMongoStore(connection),
    isDryRun,
  );

  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Obsolete Gig workflow cleanup blocked by records: ${report.before.blockingRecordIds.join(', ') || '[none]'}; hasRequiredVisibleFeedIndex=${report.before.hasRequiredVisibleFeedIndex}`,
    );
  }
  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'This cleanup is one-way. Restore the operator-verified backup instead of reconstructing removed data.',
    ),
  );
}
