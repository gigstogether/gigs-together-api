import { Types } from 'mongoose';

import { runPostNamingStorageMigration } from './1788566400000-rename-main-post-and-digest-storage';
import type {
  DigestPostStateDocument,
  LegacyDigestStateDocument,
  PostNamingStorageMigrationStore,
  PostNamingTranslationDocument,
  PostNamingTranslationRename,
} from './1788566400000-rename-main-post-and-digest-storage';

class InMemoryStore implements PostNamingStorageMigrationStore {
  readonly backups = new Set<string>();

  constructor(
    readonly legacyDigestStates: LegacyDigestStateDocument[],
    readonly digestPostStates: DigestPostStateDocument[],
    readonly translations: PostNamingTranslationDocument[],
    readonly legacyMainPostCount = 0,
  ) {}

  readLegacyMainPostCount(): Promise<number> {
    return Promise.resolve(this.legacyMainPostCount);
  }

  readLegacyDigestStates(): Promise<LegacyDigestStateDocument[]> {
    return Promise.resolve([...this.legacyDigestStates]);
  }

  readDigestPostStates(): Promise<DigestPostStateDocument[]> {
    return Promise.resolve([...this.digestPostStates]);
  }

  readTranslations(
    keys: readonly string[],
  ): Promise<PostNamingTranslationDocument[]> {
    return Promise.resolve(
      this.translations.filter(
        (document) =>
          typeof document.key === 'string' && keys.includes(document.key),
      ),
    );
  }

  backupTranslations(
    translations: readonly PostNamingTranslationRename[],
  ): Promise<{
    matchedCount: number;
    modifiedCount: number;
    upsertedCount: number;
  }> {
    let matchedCount = 0;
    let upsertedCount = 0;
    for (const { document } of translations) {
      const id = String(document._id);
      if (this.backups.has(id)) matchedCount += 1;
      else {
        this.backups.add(id);
        upsertedCount += 1;
      }
    }
    return Promise.resolve({ matchedCount, modifiedCount: 0, upsertedCount });
  }

  copyDigestState(document: LegacyDigestStateDocument): Promise<{
    matchedCount: number;
    modifiedCount: number;
    upsertedCount: number;
  }> {
    if (
      !(document.publishedAt instanceof Date) ||
      typeof document.postUrl !== 'string'
    ) {
      return Promise.resolve({
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
      });
    }
    const existing = this.digestPostStates.find(
      (item) => String(item._id) === String(document._id),
    );
    if (existing !== undefined) {
      return Promise.resolve({
        matchedCount: 1,
        modifiedCount: 0,
        upsertedCount: 0,
      });
    }
    this.digestPostStates.push({
      _id: document._id,
      postedAt: document.publishedAt,
      postUrl: document.postUrl,
    });
    return Promise.resolve({
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 1,
    });
  }

  renameTranslations(
    translations: readonly PostNamingTranslationRename[],
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    let modifiedCount = 0;
    for (const { document, targetKey } of translations) {
      const stored = this.translations.find(
        (item) => String(item._id) === String(document._id),
      );
      if (stored === undefined || stored.key !== document.key) continue;
      stored.key = targetKey;
      modifiedCount += 1;
    }
    return Promise.resolve({
      matchedCount: modifiedCount,
      modifiedCount,
    });
  }
}

function createTranslation(key: string): PostNamingTranslationDocument {
  return {
    _id: new Types.ObjectId(),
    namespace: 'telegram',
    locale: 'en',
    key,
    value: '{title}',
    format: 'plain',
    kind: 'template',
    isActive: true,
  };
}

describe('runPostNamingStorageMigration', () => {
  it('should report exact plans without writing during dry run', async () => {
    const store = new InMemoryStore(
      [
        {
          _id: new Types.ObjectId(),
          publishedAt: new Date('2026-09-01T10:00:00.000Z'),
          postUrl: 'https://t.me/c/1/42',
        },
      ],
      [],
      [createTranslation('publishedModeration.title.withLink')],
    );

    const report = await runPostNamingStorageMigration(store, true);

    expect(report.plan).toEqual({
      digestStatesToCopy: 1,
      translationsToRename: 1,
    });
    expect(report.writes.digestStates.upsertedCount).toBe(0);
    expect(store.digestPostStates).toHaveLength(0);
    expect(store.translations[0]?.key).toBe(
      'publishedModeration.title.withLink',
    );
  });

  it('should copy digest state, rename translations, and be idempotent', async () => {
    const legacyDigestState = {
      _id: new Types.ObjectId(),
      publishedAt: new Date('2026-09-01T10:00:00.000Z'),
      postUrl: 'https://t.me/c/1/42',
    };
    const store = new InMemoryStore(
      [legacyDigestState],
      [],
      [
        createTranslation('publishedModeration.title.withLink'),
        createTranslation('publishedModeration.title.withoutLink'),
      ],
    );

    const report = await runPostNamingStorageMigration(store, false);
    const rerun = await runPostNamingStorageMigration(store, false);

    expect(report.writes.digestStates.upsertedCount).toBe(1);
    expect(report.writes.translations.modifiedCount).toBe(2);
    expect(report.after).toMatchObject({
      legacyMainPostRecords: 0,
      digestPostStates: 1,
      legacyTranslationRecords: 0,
      targetTranslationRecords: 2,
      blockingRecords: [],
    });
    expect(report.canApply).toBe(true);
    expect(rerun.plan).toEqual({
      digestStatesToCopy: 0,
      translationsToRename: 0,
    });
    expect(rerun.canApply).toBe(true);
  });

  it('should block conflicting target translation content without writes', async () => {
    const source = createTranslation('publishedModeration.title.withLink');
    const target = {
      ...createTranslation('gigModeration.title.withLink'),
      value: 'Different {title}',
    };
    const store = new InMemoryStore([], [], [source, target]);

    const report = await runPostNamingStorageMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingRecords).toEqual([
      `translationConflict:${String(source._id)}`,
    ]);
    expect(report.writes.translations.modifiedCount).toBe(0);
  });

  it('should block ambiguous digest state records without writes', async () => {
    const store = new InMemoryStore(
      [
        {
          _id: new Types.ObjectId(),
          publishedAt: new Date('2026-09-01T10:00:00.000Z'),
          postUrl: 'https://t.me/c/1/42',
        },
        {
          _id: new Types.ObjectId(),
          publishedAt: new Date('2026-09-02T10:00:00.000Z'),
          postUrl: 'https://t.me/c/1/43',
        },
      ],
      [],
      [],
    );

    const report = await runPostNamingStorageMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingRecords).toHaveLength(2);
    expect(report.writes.digestStates.upsertedCount).toBe(0);
  });
});
