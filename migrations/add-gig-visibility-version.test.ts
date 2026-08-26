import { Status } from '../src/modules/gig/types/status.enum';
import { runGigVisibilityVersionMigration } from './1787616000000-add-gig-visibility-version';
import type {
  GigVisibilityVersionMigrationDocument,
  GigVisibilityVersionMigrationStore,
  GigVisibilityVersionMigrationWriteResult,
} from './1787616000000-add-gig-visibility-version';

class InMemoryGigMigrationStore implements GigVisibilityVersionMigrationStore {
  private documents: GigVisibilityVersionMigrationDocument[];

  constructor(documents: GigVisibilityVersionMigrationDocument[]) {
    this.documents = documents.map((document) => ({ ...document }));
  }

  readAll(): Promise<GigVisibilityVersionMigrationDocument[]> {
    return Promise.resolve(this.documents.map((document) => ({ ...document })));
  }

  backfillVersion(): Promise<GigVisibilityVersionMigrationWriteResult> {
    return Promise.resolve(
      this.updateMatching(
        (document) =>
          !Object.prototype.hasOwnProperty.call(document, 'version'),
        (document) => {
          document.version = 0;
        },
      ),
    );
  }

  backfillPublishedVisibility(): Promise<GigVisibilityVersionMigrationWriteResult> {
    return Promise.resolve(
      this.updateMatching(
        (document) =>
          !Object.prototype.hasOwnProperty.call(document, 'isVisible') &&
          document.status === Status.Published,
        (document) => {
          document.isVisible = true;
        },
      ),
    );
  }

  backfillNonPublicVisibility(): Promise<GigVisibilityVersionMigrationWriteResult> {
    return Promise.resolve(
      this.updateMatching(
        (document) =>
          !Object.prototype.hasOwnProperty.call(document, 'isVisible') &&
          Object.values(Status).some((status) => status === document.status) &&
          document.status !== Status.Published,
        (document) => {
          document.isVisible = false;
        },
      ),
    );
  }

  private updateMatching(
    matches: (document: GigVisibilityVersionMigrationDocument) => boolean,
    update: (document: GigVisibilityVersionMigrationDocument) => void,
  ): GigVisibilityVersionMigrationWriteResult {
    let matchedCount = 0;
    for (const document of this.documents) {
      if (!matches(document)) {
        continue;
      }
      matchedCount += 1;
      update(document);
    }
    return { matchedCount, modifiedCount: matchedCount };
  }
}

describe('runGigVisibilityVersionMigration', () => {
  it('should report exact dry-run counts without writing', async () => {
    const store = new InMemoryGigMigrationStore([
      { _id: 'published-1', status: Status.Published },
      { _id: 'pending-1', status: Status.Pending },
      { _id: 'versioned-1', status: Status.New, version: 2, isVisible: false },
    ]);

    const report = await runGigVisibilityVersionMigration(store, true);

    expect(report).toMatchObject({
      mode: 'dry-run',
      canApply: true,
      before: {
        totalGigs: 3,
        missingVersion: 2,
        missingVisibility: 2,
        legacyPublished: 1,
        visible: 0,
      },
      plan: {
        versionMatched: 2,
        publishedVisibilityMatched: 1,
        nonPublicVisibilityMatched: 1,
      },
      writes: {
        version: { matchedCount: 0, modifiedCount: 0 },
        publishedVisibility: { matchedCount: 0, modifiedCount: 0 },
        nonPublicVisibility: { matchedCount: 0, modifiedCount: 0 },
      },
      projectedAfter: {
        missingVersion: 0,
        missingVisibility: 0,
        legacyPublished: 1,
        visible: 1,
      },
      after: {
        missingVersion: 2,
        missingVisibility: 2,
      },
    });
  });

  it('should apply once and report zero matched records on rerun', async () => {
    const store = new InMemoryGigMigrationStore([
      { _id: 'published-1', status: Status.Published },
      { _id: 'approved-1', status: Status.Approved },
      { _id: 'rejected-1', status: Status.Rejected },
    ]);

    const firstReport = await runGigVisibilityVersionMigration(store, false);
    const rerunReport = await runGigVisibilityVersionMigration(store, false);

    expect(firstReport.writes).toEqual({
      version: { matchedCount: 3, modifiedCount: 3 },
      publishedVisibility: { matchedCount: 1, modifiedCount: 1 },
      nonPublicVisibility: { matchedCount: 2, modifiedCount: 2 },
    });
    expect(firstReport.after).toMatchObject({
      totalGigs: 3,
      integerVersion: 3,
      missingVersion: 0,
      missingVisibility: 0,
      legacyPublished: 1,
      visible: 1,
      hidden: 2,
      publishedNotVisible: 0,
      visibleNotPublished: 0,
    });
    expect(rerunReport.plan).toEqual({
      versionMatched: 0,
      publishedVisibilityMatched: 0,
      nonPublicVisibilityMatched: 0,
    });
    expect(rerunReport.writes).toEqual({
      version: { matchedCount: 0, modifiedCount: 0 },
      publishedVisibility: { matchedCount: 0, modifiedCount: 0 },
      nonPublicVisibility: { matchedCount: 0, modifiedCount: 0 },
    });
  });

  it('should block apply instead of guessing inconsistent records', async () => {
    const store = new InMemoryGigMigrationStore([
      {
        _id: 'published-hidden',
        status: Status.Published,
        version: 0,
        isVisible: false,
      },
      { _id: 'unknown-status', status: 'Archived' },
      { _id: 'invalid-version', status: Status.Pending, version: 1.5 },
    ]);
    const backfillVersionSpy = vi.spyOn(store, 'backfillVersion');

    const report = await runGigVisibilityVersionMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingRecordIds).toEqual([
      'invalid-version',
      'published-hidden',
      'unknown-status',
    ]);
    expect(backfillVersionSpy).not.toHaveBeenCalled();
  });
});
