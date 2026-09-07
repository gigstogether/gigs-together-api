import type { Connection, Types } from 'mongoose';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const BACKUP_COLLECTION = 'post_naming_cleanup_backup';
const LEGACY_DIGEST_STATE_COLLECTION = 'digestpublicationstates';
const DIGEST_STATE_COLLECTION = 'digestpoststates';
const TRANSLATION_COLLECTION = 'translations';

const TRANSLATION_KEY_RENAMES = [
  {
    from: 'publishedModeration.title.withLink',
    to: 'gigModeration.title.withLink',
  },
  {
    from: 'publishedModeration.title.withoutLink',
    to: 'gigModeration.title.withoutLink',
  },
] as const;

export interface LegacyDigestStateDocument {
  _id: Types.ObjectId;
  publishedAt?: unknown;
  postUrl?: unknown;
}

export interface DigestPostStateDocument {
  _id: Types.ObjectId;
  postedAt?: unknown;
  postUrl?: unknown;
}

export interface PostNamingTranslationDocument {
  _id: Types.ObjectId;
  namespace?: unknown;
  locale?: unknown;
  key?: unknown;
  value?: unknown;
  format?: unknown;
  kind?: unknown;
  isActive?: unknown;
}

interface ValidPostNamingTranslationDocument extends PostNamingTranslationDocument {
  namespace: string;
  locale: string;
  key: string;
  value: string;
  format: 'plain' | 'icu';
  kind: 'text' | 'template';
  isActive: boolean;
}

export interface PostNamingTranslationRename {
  document: PostNamingTranslationDocument;
  targetKey: string;
}

interface MigrationWriteCount {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount?: number;
}

export interface PostNamingStorageMigrationStore {
  readLegacyMainPostCount(): Promise<number>;
  readLegacyDigestStates(): Promise<LegacyDigestStateDocument[]>;
  readDigestPostStates(): Promise<DigestPostStateDocument[]>;
  readTranslations(
    keys: readonly string[],
  ): Promise<PostNamingTranslationDocument[]>;
  backupTranslations(
    translations: readonly PostNamingTranslationRename[],
  ): Promise<MigrationWriteCount>;
  copyDigestState(
    document: LegacyDigestStateDocument,
  ): Promise<MigrationWriteCount>;
  renameTranslations(
    translations: readonly PostNamingTranslationRename[],
  ): Promise<MigrationWriteCount>;
}

interface MigrationSnapshot {
  legacyMainPostRecords: number;
  legacyDigestStates: number;
  digestPostStates: number;
  legacyTranslationRecords: number;
  targetTranslationRecords: number;
  blockingRecords: string[];
}

interface MigrationPlan {
  digestStatesToCopy: number;
  translationsToRename: number;
}

interface MigrationWrites {
  digestStates: MigrationWriteCount;
  translationBackups: MigrationWriteCount;
  translations: MigrationWriteCount;
}

interface MigrationAnalysis {
  snapshot: MigrationSnapshot;
  digestStateToCopy?: LegacyDigestStateDocument;
  translationsToRename: PostNamingTranslationRename[];
}

export interface PostNamingStorageMigrationReport {
  mode: 'dry-run' | 'apply';
  before: MigrationSnapshot;
  plan: MigrationPlan;
  writes: MigrationWrites;
  after: MigrationSnapshot;
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

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function translationIdentity(
  document: PostNamingTranslationDocument,
  key: string,
): string {
  return `${String(document.namespace)}\u0000${String(document.locale)}\u0000${key}`;
}

function hasEquivalentTranslationContent(
  source: PostNamingTranslationDocument,
  target: PostNamingTranslationDocument,
): boolean {
  return (
    source.value === target.value &&
    source.format === target.format &&
    source.kind === target.kind &&
    source.isActive === target.isActive
  );
}

function isValidTranslationDocument(
  document: PostNamingTranslationDocument,
): document is ValidPostNamingTranslationDocument {
  return (
    typeof document.namespace === 'string' &&
    document.namespace.trim() !== '' &&
    typeof document.locale === 'string' &&
    document.locale.trim() !== '' &&
    typeof document.key === 'string' &&
    typeof document.value === 'string' &&
    (document.format === 'plain' || document.format === 'icu') &&
    (document.kind === 'text' || document.kind === 'template') &&
    typeof document.isActive === 'boolean'
  );
}

function analyze(
  legacyMainPostRecords: number,
  legacyDigestStates: LegacyDigestStateDocument[],
  digestPostStates: DigestPostStateDocument[],
  translations: PostNamingTranslationDocument[],
): MigrationAnalysis {
  const blockingRecords = new Set<string>();
  let digestStateToCopy: LegacyDigestStateDocument | undefined;

  if (
    !Number.isSafeInteger(legacyMainPostRecords) ||
    legacyMainPostRecords < 0
  ) {
    blockingRecords.add('legacyMainPostRecords:invalid-count');
  } else if (legacyMainPostRecords > 0) {
    blockingRecords.add(`legacyMainPostRecords:${legacyMainPostRecords}`);
  }

  if (legacyDigestStates.length > 1) {
    for (const document of legacyDigestStates) {
      blockingRecords.add(`legacyDigestState:${recordId(document._id)}`);
    }
  }
  if (digestPostStates.length > 1) {
    for (const document of digestPostStates) {
      blockingRecords.add(`digestPostState:${recordId(document._id)}`);
    }
  }

  const legacyDigestState = legacyDigestStates[0];
  const digestPostState = digestPostStates[0];
  if (
    legacyDigestState !== undefined &&
    (!isValidDate(legacyDigestState.publishedAt) ||
      typeof legacyDigestState.postUrl !== 'string' ||
      legacyDigestState.postUrl.trim() === '')
  ) {
    blockingRecords.add(`legacyDigestState:${recordId(legacyDigestState._id)}`);
  }
  if (
    digestPostState !== undefined &&
    (!isValidDate(digestPostState.postedAt) ||
      typeof digestPostState.postUrl !== 'string' ||
      digestPostState.postUrl.trim() === '')
  ) {
    blockingRecords.add(`digestPostState:${recordId(digestPostState._id)}`);
  }
  if (
    legacyDigestState !== undefined &&
    digestPostState !== undefined &&
    isValidDate(legacyDigestState.publishedAt) &&
    isValidDate(digestPostState.postedAt) &&
    (recordId(legacyDigestState._id) !== recordId(digestPostState._id) ||
      legacyDigestState.publishedAt.getTime() !==
        digestPostState.postedAt.getTime() ||
      legacyDigestState.postUrl !== digestPostState.postUrl)
  ) {
    blockingRecords.add(
      `digestStateConflict:${recordId(legacyDigestState._id)}`,
    );
  } else if (
    legacyDigestState !== undefined &&
    digestPostState === undefined &&
    isValidDate(legacyDigestState.publishedAt) &&
    typeof legacyDigestState.postUrl === 'string' &&
    legacyDigestState.postUrl.trim() !== ''
  ) {
    digestStateToCopy = legacyDigestState;
  }

  const legacyKeys = new Set<string>(
    TRANSLATION_KEY_RENAMES.map(({ from }) => from),
  );
  const targetKeys = new Set<string>(
    TRANSLATION_KEY_RENAMES.map(({ to }) => to),
  );
  const targetByIdentity = new Map<string, PostNamingTranslationDocument>();
  for (const document of translations) {
    if (!isValidTranslationDocument(document)) {
      blockingRecords.add(`translation:${recordId(document._id)}`);
      continue;
    }
    if (targetKeys.has(document.key)) {
      const identity = translationIdentity(document, document.key);
      const existing = targetByIdentity.get(identity);
      if (existing !== undefined) {
        blockingRecords.add(`translation:${recordId(existing._id)}`);
        blockingRecords.add(`translation:${recordId(document._id)}`);
        continue;
      }
      targetByIdentity.set(identity, document);
    }
  }

  const translationsToRename: PostNamingTranslationRename[] = [];
  const legacyTranslationByIdentity = new Map<
    string,
    PostNamingTranslationDocument
  >();
  for (const document of translations) {
    if (
      !isValidTranslationDocument(document) ||
      !legacyKeys.has(document.key)
    ) {
      continue;
    }
    const rename = TRANSLATION_KEY_RENAMES.find(
      ({ from }) => from === document.key,
    );
    if (rename === undefined) {
      continue;
    }
    const legacyIdentity = translationIdentity(document, document.key);
    const duplicateLegacy = legacyTranslationByIdentity.get(legacyIdentity);
    if (duplicateLegacy !== undefined) {
      blockingRecords.add(`translation:${recordId(duplicateLegacy._id)}`);
      blockingRecords.add(`translation:${recordId(document._id)}`);
      continue;
    }
    legacyTranslationByIdentity.set(legacyIdentity, document);
    const target = targetByIdentity.get(
      translationIdentity(document, rename.to),
    );
    if (target !== undefined) {
      const conflictKind = hasEquivalentTranslationContent(document, target)
        ? 'duplicateTranslation'
        : 'translationConflict';
      blockingRecords.add(`${conflictKind}:${recordId(document._id)}`);
      continue;
    }
    translationsToRename.push({ document, targetKey: rename.to });
  }

  return {
    snapshot: {
      legacyMainPostRecords,
      legacyDigestStates: legacyDigestStates.length,
      digestPostStates: digestPostStates.length,
      legacyTranslationRecords: translations.filter(
        (document) =>
          typeof document.key === 'string' && legacyKeys.has(document.key),
      ).length,
      targetTranslationRecords: translations.filter(
        (document) =>
          typeof document.key === 'string' && targetKeys.has(document.key),
      ).length,
      blockingRecords: [...blockingRecords].sort(),
    },
    digestStateToCopy,
    translationsToRename,
  };
}

async function readAnalysis(
  store: PostNamingStorageMigrationStore,
): Promise<MigrationAnalysis> {
  const keys = TRANSLATION_KEY_RENAMES.flatMap(({ from, to }) => [from, to]);
  const [
    legacyMainPostRecords,
    legacyDigestStates,
    digestPostStates,
    translations,
  ] = await Promise.all([
    store.readLegacyMainPostCount(),
    store.readLegacyDigestStates(),
    store.readDigestPostStates(),
    store.readTranslations(keys),
  ]);
  return analyze(
    legacyMainPostRecords,
    legacyDigestStates,
    digestPostStates,
    translations,
  );
}

export async function runPostNamingStorageMigration(
  store: PostNamingStorageMigrationStore,
  dryRun: boolean,
): Promise<PostNamingStorageMigrationReport> {
  const beforeAnalysis = await readAnalysis(store);
  const canPlan = beforeAnalysis.snapshot.blockingRecords.length === 0;
  const writes: MigrationWrites = {
    digestStates: emptyWriteCount(),
    translationBackups: emptyWriteCount(),
    translations: emptyWriteCount(),
  };

  if (!dryRun && canPlan) {
    if (beforeAnalysis.digestStateToCopy !== undefined) {
      writes.digestStates = await store.copyDigestState(
        beforeAnalysis.digestStateToCopy,
      );
      if (
        writes.digestStates.matchedCount +
          (writes.digestStates.upsertedCount ?? 0) !==
        1
      ) {
        throw new Error(
          'Digest post state write count does not match the plan',
        );
      }
    }

    if (beforeAnalysis.translationsToRename.length > 0) {
      writes.translationBackups = await store.backupTranslations(
        beforeAnalysis.translationsToRename,
      );
      if (
        writes.translationBackups.matchedCount +
          (writes.translationBackups.upsertedCount ?? 0) !==
        beforeAnalysis.translationsToRename.length
      ) {
        throw new Error('Translation backup count does not match the plan');
      }
      writes.translations = await store.renameTranslations(
        beforeAnalysis.translationsToRename,
      );
      if (
        writes.translations.matchedCount !==
          beforeAnalysis.translationsToRename.length ||
        writes.translations.modifiedCount !==
          beforeAnalysis.translationsToRename.length
      ) {
        throw new Error('Translation rename count does not match the plan');
      }
    }
  }

  const after = dryRun
    ? beforeAnalysis.snapshot
    : (await readAnalysis(store)).snapshot;
  const canApply =
    canPlan &&
    (dryRun ||
      (after.blockingRecords.length === 0 &&
        after.legacyTranslationRecords === 0 &&
        (after.legacyDigestStates === 0 || after.digestPostStates === 1)));

  return {
    mode: dryRun ? 'dry-run' : 'apply',
    before: beforeAnalysis.snapshot,
    plan: {
      digestStatesToCopy:
        beforeAnalysis.digestStateToCopy === undefined ? 0 : 1,
      translationsToRename: beforeAnalysis.translationsToRename.length,
    },
    writes,
    after,
    canApply,
    rollback: `Translation records changed by this migration are preserved in ${BACKUP_COLLECTION}. Restore them and remove the copied ${DIGEST_STATE_COLLECTION} record only during a separately approved maintenance rollback.`,
  };
}

function createMongoStore(
  connection: Connection,
): PostNamingStorageMigrationStore {
  const legacyDigestStates = connection.collection<LegacyDigestStateDocument>(
    LEGACY_DIGEST_STATE_COLLECTION,
  );
  const digestPostStates = connection.collection<DigestPostStateDocument>(
    DIGEST_STATE_COLLECTION,
  );
  const translations = connection.collection<PostNamingTranslationDocument>(
    TRANSLATION_COLLECTION,
  );
  const gigs = connection.collection('gigs');
  const backups = connection.collection(BACKUP_COLLECTION);

  return {
    readLegacyMainPostCount: () =>
      gigs.countDocuments({ 'posts.type': 'Publish' }),
    readLegacyDigestStates: () => legacyDigestStates.find({}).toArray(),
    readDigestPostStates: () => digestPostStates.find({}).toArray(),
    readTranslations: (keys) =>
      translations.find({ key: { $in: [...keys] } }).toArray(),
    async backupTranslations(records) {
      if (records.length === 0) return emptyWriteCount();
      const result = await backups.bulkWrite(
        records.map(({ document, targetKey }) => ({
          updateOne: {
            filter: {
              _id: {
                sourceCollection: TRANSLATION_COLLECTION,
                sourceId: recordId(document._id),
              },
            },
            update: {
              $setOnInsert: {
                sourceCollection: TRANSLATION_COLLECTION,
                sourceId: document._id,
                targetKey,
                document,
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
    async copyDigestState(document) {
      if (
        !isValidDate(document.publishedAt) ||
        typeof document.postUrl !== 'string'
      ) {
        throw new Error('Cannot copy an invalid digest state document');
      }
      const result = await digestPostStates.updateOne(
        { _id: document._id },
        {
          $setOnInsert: {
            _id: document._id,
            postedAt: document.publishedAt,
            postUrl: document.postUrl,
          },
        },
        { upsert: true },
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      };
    },
    async renameTranslations(records) {
      if (records.length === 0) return emptyWriteCount();
      const result = await translations.bulkWrite(
        records.map(({ document, targetKey }) => ({
          updateOne: {
            filter: {
              _id: document._id,
              namespace: document.namespace,
              locale: document.locale,
              key: document.key,
            },
            update: { $set: { key: targetKey } },
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
  const report = await runPostNamingStorageMigration(
    createMongoStore(connection),
    dryRun,
  );
  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Post naming storage migration blocked: ${report.before.blockingRecords.join(', ')}`,
    );
  }
  finishMigrationDryRun(dryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'Post naming storage rollback requires separate approval and verified backup counts.',
    ),
  );
}
