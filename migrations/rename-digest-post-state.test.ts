import { runDigestPostStateMigration } from './1789516800000-rename-digest-post-state';
import type {
  DigestPostStateMigrationDocument,
  DigestPostStateMigrationStore,
  DigestPostStateMigrationWriteResult,
} from './1789516800000-rename-digest-post-state';

class InMemoryDigestPostStateStore implements DigestPostStateMigrationStore {
  private documents: DigestPostStateMigrationDocument[];

  constructor(documents: DigestPostStateMigrationDocument[]) {
    this.documents = documents.map((document) => ({ ...document }));
  }

  readAll(): Promise<DigestPostStateMigrationDocument[]> {
    return Promise.resolve(this.documents.map((document) => ({ ...document })));
  }

  renamePostDate(): Promise<DigestPostStateMigrationWriteResult> {
    let matchedCount = 0;
    for (const document of this.documents) {
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
}

describe('runDigestPostStateMigration', () => {
  it('should report a dry run without changing the stored date field', async () => {
    const store = new InMemoryDigestPostStateStore([
      {
        _id: 'digest-state',
        publishedAt: new Date('2026-09-14T12:00:00Z'),
        postUrl: 'https://t.me/gigs/42',
      },
    ]);

    const report = await runDigestPostStateMigration(store, true);

    expect(report).toMatchObject({
      mode: 'dry-run',
      canApply: true,
      plannedRenames: 1,
      writes: { matchedCount: 0, modifiedCount: 0 },
      before: { legacyDateOnly: 1, targetDateOnly: 0 },
      projectedAfter: { legacyDateOnly: 0, targetDateOnly: 1 },
      after: { legacyDateOnly: 1, targetDateOnly: 0 },
    });
  });

  it('should apply once and report zero writes on rerun', async () => {
    const store = new InMemoryDigestPostStateStore([
      {
        _id: 'digest-state',
        publishedAt: new Date('2026-09-14T12:00:00Z'),
        postUrl: 'https://t.me/gigs/42',
      },
    ]);

    const firstReport = await runDigestPostStateMigration(store, false);
    const rerunReport = await runDigestPostStateMigration(store, false);

    expect(firstReport.writes).toEqual({ matchedCount: 1, modifiedCount: 1 });
    expect(firstReport.after).toMatchObject({
      legacyDateOnly: 0,
      targetDateOnly: 1,
      blockingRecordIds: [],
    });
    expect(rerunReport.plannedRenames).toBe(0);
    expect(rerunReport.writes).toEqual({ matchedCount: 0, modifiedCount: 0 });
  });

  it('should block ambiguous or invalid state without writing', async () => {
    const store = new InMemoryDigestPostStateStore([
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
    ]);
    const renameSpy = vi.spyOn(store, 'renamePostDate');

    const report = await runDigestPostStateMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingRecordIds).toEqual([
      'both-fields',
      'invalid-date',
    ]);
    expect(renameSpy).not.toHaveBeenCalled();
  });
});
