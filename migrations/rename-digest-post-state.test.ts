import { runDigestPostStateMigration } from './1789516800000-rename-digest-post-state';
import type {
  DigestPostStateMigrationCollections,
  DigestPostStateMigrationDocument,
  DigestPostStateMigrationStore,
  DigestPostStateMigrationWriteResult,
} from './1789516800000-rename-digest-post-state';

class InMemoryDigestPostStateStore implements DigestPostStateMigrationStore {
  private collections: DigestPostStateMigrationCollections;

  constructor(collections: DigestPostStateMigrationCollections) {
    this.collections = this.cloneCollections(collections);
  }

  readCollections(): Promise<DigestPostStateMigrationCollections> {
    return Promise.resolve(this.cloneCollections(this.collections));
  }

  renameCollection(): Promise<void> {
    if (this.collections.targetExists) {
      return Promise.reject(new Error('Target collection already exists'));
    }
    this.collections.targetExists = true;
    this.collections.targetDocuments = this.collections.legacyDocuments;
    this.collections.legacyExists = false;
    this.collections.legacyDocuments = [];
    return Promise.resolve();
  }

  renamePostDate(): Promise<DigestPostStateMigrationWriteResult> {
    let matchedCount = 0;
    for (const document of this.collections.targetDocuments) {
      if (
        Object.prototype.hasOwnProperty.call(document, 'publishedAt') &&
        !Object.prototype.hasOwnProperty.call(document, 'postedAt')
      ) {
        matchedCount += 1;
        document.postedAt = document.publishedAt;
        delete document.publishedAt;
      }
    }
    return Promise.resolve({ matchedCount, modifiedCount: matchedCount });
  }

  private cloneCollections(
    collections: DigestPostStateMigrationCollections,
  ): DigestPostStateMigrationCollections {
    return {
      legacyExists: collections.legacyExists,
      targetExists: collections.targetExists,
      legacyDocuments: this.cloneDocuments(collections.legacyDocuments),
      targetDocuments: this.cloneDocuments(collections.targetDocuments),
    };
  }

  private cloneDocuments(
    documents: DigestPostStateMigrationDocument[],
  ): DigestPostStateMigrationDocument[] {
    return documents.map((document) => ({ ...document }));
  }
}

describe('runDigestPostStateMigration', () => {
  it('should report a dry run without changing the stored date field', async () => {
    const store = new InMemoryDigestPostStateStore({
      legacyExists: true,
      targetExists: false,
      legacyDocuments: [
        {
          _id: 'digest-state',
          publishedAt: new Date('2026-09-14T12:00:00Z'),
          postUrl: 'https://t.me/gigs/42',
        },
      ],
      targetDocuments: [],
    });

    const report = await runDigestPostStateMigration(store, true);

    expect(report).toMatchObject({
      mode: 'dry-run',
      canApply: true,
      plannedCollectionRenames: 1,
      plannedDateRenames: 1,
      writes: {
        collectionRenamed: false,
        dateFields: { matchedCount: 0, modifiedCount: 0 },
      },
      before: {
        legacyCollectionExists: true,
        targetCollectionExists: false,
        legacyDateOnly: 1,
        targetDateOnly: 0,
      },
      projectedAfter: {
        legacyCollectionExists: false,
        targetCollectionExists: true,
        legacyDateOnly: 0,
        targetDateOnly: 1,
      },
      after: {
        legacyCollectionExists: true,
        targetCollectionExists: false,
        legacyDateOnly: 1,
        targetDateOnly: 0,
      },
    });
  });

  it('should apply once and report zero writes on rerun', async () => {
    const store = new InMemoryDigestPostStateStore({
      legacyExists: true,
      targetExists: false,
      legacyDocuments: [
        {
          _id: 'digest-state',
          publishedAt: new Date('2026-09-14T12:00:00Z'),
          postUrl: 'https://t.me/gigs/42',
        },
      ],
      targetDocuments: [],
    });

    const firstReport = await runDigestPostStateMigration(store, false);
    const rerunReport = await runDigestPostStateMigration(store, false);

    expect(firstReport.writes).toEqual({
      collectionRenamed: true,
      dateFields: { matchedCount: 1, modifiedCount: 1 },
    });
    expect(firstReport.after).toMatchObject({
      legacyCollectionExists: false,
      targetCollectionExists: true,
      legacyDateOnly: 0,
      targetDateOnly: 1,
      blockingRecordIds: [],
    });
    expect(rerunReport.plannedCollectionRenames).toBe(0);
    expect(rerunReport.plannedDateRenames).toBe(0);
    expect(rerunReport.writes).toEqual({
      collectionRenamed: false,
      dateFields: { matchedCount: 0, modifiedCount: 0 },
    });
  });

  it('should block invalid documents without writing', async () => {
    const store = new InMemoryDigestPostStateStore({
      legacyExists: true,
      targetExists: false,
      legacyDocuments: [
        {
          _id: 'both-fields',
          publishedAt: new Date('2026-09-14T12:00:00Z'),
          postedAt: new Date('2026-09-15T12:00:00Z'),
          postUrl: 'https://t.me/gigs/42',
        },
        {
          _id: 'invalid-date',
          publishedAt: 'not-a-date',
          postUrl: 'https://t.me/gigs/43',
        },
      ],
      targetDocuments: [],
    });
    const collectionRenameSpy = vi.spyOn(store, 'renameCollection');
    const dateRenameSpy = vi.spyOn(store, 'renamePostDate');

    const report = await runDigestPostStateMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingRecordIds).toEqual([
      'both-fields',
      'invalid-date',
    ]);
    expect(collectionRenameSpy).not.toHaveBeenCalled();
    expect(dateRenameSpy).not.toHaveBeenCalled();
  });

  it('should block when both collection names exist', async () => {
    const store = new InMemoryDigestPostStateStore({
      legacyExists: true,
      targetExists: true,
      legacyDocuments: [],
      targetDocuments: [
        {
          _id: 'digest-state',
          postedAt: new Date('2026-09-14T12:00:00Z'),
          postUrl: 'https://t.me/gigs/42',
        },
      ],
    });
    const collectionRenameSpy = vi.spyOn(store, 'renameCollection');
    const dateRenameSpy = vi.spyOn(store, 'renamePostDate');

    const report = await runDigestPostStateMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.hasCollectionConflict).toBe(true);
    expect(report.before.blockingRecordIds).toEqual([]);
    expect(collectionRenameSpy).not.toHaveBeenCalled();
    expect(dateRenameSpy).not.toHaveBeenCalled();
  });

  it('should finish the field rename when the collection was already renamed', async () => {
    const store = new InMemoryDigestPostStateStore({
      legacyExists: false,
      targetExists: true,
      legacyDocuments: [],
      targetDocuments: [
        {
          _id: 'digest-state',
          publishedAt: new Date('2026-09-14T12:00:00Z'),
          postUrl: 'https://t.me/gigs/42',
        },
      ],
    });

    const report = await runDigestPostStateMigration(store, false);

    expect(report.plannedCollectionRenames).toBe(0);
    expect(report.plannedDateRenames).toBe(1);
    expect(report.writes).toEqual({
      collectionRenamed: false,
      dateFields: { matchedCount: 1, modifiedCount: 1 },
    });
    expect(report.after).toMatchObject({
      legacyCollectionExists: false,
      targetCollectionExists: true,
      legacyDateOnly: 0,
      targetDateOnly: 1,
      blockingRecordIds: [],
    });
  });
});
