import { Types } from 'mongoose';

import { runStage9GigCandidateMigration } from './1787788800000-migrate-legacy-gigs-to-gig-candidates';
import type { Stage9MigrationStore } from './1787788800000-migrate-legacy-gigs-to-gig-candidates';

type TestDocument = Record<string, unknown> & { _id: Types.ObjectId };
type TestBackup = TestDocument & {
  migration: string;
  originalGig: TestDocument;
};

const CONFIRMATION = 'delete-non-public-legacy-gigs';

function adminUser(): TestDocument {
  return {
    _id: new Types.ObjectId('66a000000000000000000001'),
    status: 'active',
    roles: ['admin'],
    identities: [
      {
        type: 'messenger',
        messenger: 'Telegram',
        externalUserId: '42',
      },
    ],
  };
}

function gig(
  id: string,
  status: 'Pending' | 'Published' | 'Rejected',
): TestDocument {
  return {
    _id: new Types.ObjectId(id),
    publicId: `legacy-${id.slice(-4)}`,
    title: 'Legacy Gig',
    date: 1_800_000_000_000,
    city: 'barcelona',
    country: 'ES',
    venue: 'Venue',
    ticketsUrl: 'https://example.com/tickets',
    poster: { bucketPath: 'posters/legacy' },
    status,
    isVisible: status === 'Published',
    version: 0,
    posts: [
      {
        to: 'Telegram',
        type: status === 'Published' ? 'Publish' : 'Moderation',
        date: 1_700_000_000_000,
        id: 10,
        chatId: 20,
        fileId: 'file-id',
      },
    ],
    suggestedBy: { userId: 42, name: 'Legacy Admin' },
  };
}

function createStore(initialGigs: TestDocument[]): {
  store: Stage9MigrationStore;
  state: {
    gigs: TestDocument[];
    gigCandidates: TestDocument[];
    users: TestDocument[];
    backups: TestBackup[];
  };
} {
  const state = {
    gigs: [...initialGigs],
    gigCandidates: [] as TestDocument[],
    users: [adminUser()],
    backups: [] as TestBackup[],
  };
  const store: Stage9MigrationStore = {
    readGigs: async () => state.gigs,
    readGigCandidates: async () => state.gigCandidates,
    readUsers: async () => state.users,
    readBackups: async () => state.backups,
    backupGigs: async (documents) => {
      for (const document of documents) {
        state.backups.push({
          _id: document._id,
          migration: 'migrate-legacy-gigs-to-gig-candidates',
          originalGig: document,
        });
      }
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: documents.length,
      };
    },
    insertGigCandidates: async (documents) => {
      state.gigCandidates.push(...documents);
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: documents.length,
      };
    },
    updatePublishedGigs: async (documents) => {
      for (const document of documents) {
        const index = state.gigs.findIndex((item) =>
          item._id.equals(document._id),
        );
        state.gigs[index] = document;
      }
      return {
        matchedCount: documents.length,
        modifiedCount: documents.length,
      };
    },
    deleteMigratedGigs: async (ids) => {
      const idSet = new Set(ids.map(String));
      const before = state.gigs.length;
      state.gigs = state.gigs.filter(
        (document) => !idSet.has(String(document._id)),
      );
      const deletedCount = before - state.gigs.length;
      return {
        matchedCount: deletedCount,
        modifiedCount: deletedCount,
        deletedCount,
      };
    },
  };
  return { store, state };
}

describe('Stage 9 legacy Gig to GigCandidate migration', () => {
  it('should report an exact dry-run without writing', async () => {
    const pendingGig = gig('66b000000000000000000001', 'Pending');
    const publishedGig = gig('66b000000000000000000002', 'Published');
    const { store, state } = createStore([pendingGig, publishedGig]);

    const report = await runStage9GigCandidateMigration(store, true, undefined);

    expect(report).toMatchObject({
      mode: 'dry-run',
      canApply: true,
      before: {
        totalGigs: 2,
        statusCounts: { Pending: 1, Published: 1, Rejected: 0 },
      },
      plan: {
        retainedPublishedGigs: 1,
        gigCandidatesToCreate: 1,
        legacyGigsToDelete: 1,
        publishedGigsToUpdate: 1,
        publishPostsToConvert: 1,
        backupDocumentsToCreate: 2,
        gigCandidateTimestampsDerivedFromLegacyGigObjectIds: 1,
      },
      projectedAfter: {
        totalGigs: 1,
        statusCounts: { Pending: 0, Published: 1, Rejected: 0 },
        totalGigCandidates: 1,
        totalBackups: 2,
      },
    });
    expect(state.gigs).toHaveLength(2);
    expect(state.gigCandidates).toHaveLength(0);
    expect(state.backups).toHaveLength(0);
  });

  it('should require the explicit destructive confirmation before any write', async () => {
    const { store, state } = createStore([
      gig('66b000000000000000000001', 'Pending'),
    ]);

    await expect(
      runStage9GigCandidateMigration(store, false, undefined),
    ).rejects.toThrowError(/STAGE_9_DELETE_CONFIRMATION/);
    expect(state.gigs).toHaveLength(1);
    expect(state.gigCandidates).toHaveLength(0);
    expect(state.backups).toHaveLength(0);
  });

  it('should not require destructive confirmation when no Gig is deleted', async () => {
    const { store, state } = createStore([
      gig('66b000000000000000000002', 'Published'),
    ]);

    const report = await runStage9GigCandidateMigration(
      store,
      false,
      undefined,
    );

    expect(report.canApply).toBe(true);
    expect(report.destructiveApplyConfirmation).toBeNull();
    expect(report.writes).toMatchObject({
      backups: { upsertedCount: 1 },
      publishedGigs: { matchedCount: 1, modifiedCount: 1 },
      legacyGigs: { deletedCount: 0 },
    });
    expect(state.gigs).toHaveLength(1);
    expect(state.backups).toHaveLength(1);
  });

  it('should migrate, preserve data, derive both timestamps, and rerun idempotently', async () => {
    const pendingGig = gig('66b000000000000000000001', 'Pending');
    const publishedGig = gig('66b000000000000000000002', 'Published');
    const { store, state } = createStore([pendingGig, publishedGig]);

    const first = await runStage9GigCandidateMigration(
      store,
      false,
      CONFIRMATION,
    );

    expect(first.writes).toMatchObject({
      backups: { upsertedCount: 2 },
      gigCandidates: { upsertedCount: 1 },
      publishedGigs: { matchedCount: 1, modifiedCount: 1 },
      legacyGigs: { deletedCount: 1 },
    });
    expect(state.gigs).toHaveLength(1);
    expect(state.gigCandidates).toHaveLength(1);
    expect(state.backups).toHaveLength(2);

    const gigCandidate = state.gigCandidates[0];
    const expectedTimestamp = pendingGig._id.getTimestamp();
    expect(gigCandidate).toMatchObject({
      status: 'Reviewing',
      version: 0,
      source: {
        type: 'user',
        userId: state.users[0]._id,
        origin: { type: 'admin' },
      },
      gigDraft: {
        title: pendingGig.title,
        date: pendingGig.date,
        poster: pendingGig.poster,
      },
      posts: pendingGig.posts,
      createdAt: expectedTimestamp,
      updatedAt: expectedTimestamp,
    });
    expect(gigCandidate.gigDraft).not.toHaveProperty('publicId');
    expect(state.gigs[0]).toMatchObject({
      status: 'Published',
      isVisible: true,
      source: { type: 'user', origin: { type: 'admin' } },
      posts: [{ type: 'Main' }],
    });
    expect(state.gigs[0]).not.toHaveProperty('createdAt');
    expect(state.gigs[0]).not.toHaveProperty('updatedAt');

    const rerun = await runStage9GigCandidateMigration(
      store,
      false,
      CONFIRMATION,
    );
    expect(rerun.plan).toMatchObject({
      gigCandidatesToCreate: 0,
      alreadyMigratedGigCandidates: 1,
      legacyGigsToDelete: 0,
      publishedGigsToUpdate: 0,
      backupDocumentsToCreate: 0,
    });
    expect(rerun.writes).toMatchObject({
      backups: { upsertedCount: 0 },
      gigCandidates: { upsertedCount: 0 },
      publishedGigs: { matchedCount: 0, modifiedCount: 0 },
      legacyGigs: { deletedCount: 0 },
    });
  });

  it('should block Rejected Gigs without performing writes', async () => {
    const rejectedGig = gig('66b000000000000000000003', 'Rejected');
    const { store, state } = createStore([rejectedGig]);

    const report = await runStage9GigCandidateMigration(
      store,
      false,
      CONFIRMATION,
    );

    expect(report.canApply).toBe(false);
    expect(report.blockingRecordIds).toEqual([String(rejectedGig._id)]);
    expect(state.gigs).toHaveLength(1);
    expect(state.gigCandidates).toHaveLength(0);
  });
});
