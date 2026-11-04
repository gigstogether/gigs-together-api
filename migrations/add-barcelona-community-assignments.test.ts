import { Types } from 'mongoose';

import { runBarcelonaCommunityMigration } from './1793750400000-add-barcelona-community-assignments';
import type {
  BarcelonaCommunityInsertDocument,
  BarcelonaCommunityMigrationState,
  BarcelonaCommunityMigrationStore,
  BarcelonaCommunityMigrationWriteResult,
  BarcelonaTranslationInsertDocument,
  CommunityAssignmentMigrationDocument,
} from './1793750400000-add-barcelona-community-assignments';

const NOW = new Date('2026-11-04T00:00:00.000Z');

function cloneAssignmentDocument(
  document: CommunityAssignmentMigrationDocument,
): CommunityAssignmentMigrationDocument {
  const clone: CommunityAssignmentMigrationDocument = { ...document };
  if (Array.isArray(document.communityIds)) {
    clone.communityIds = [...document.communityIds];
  }
  return clone;
}

class InMemoryBarcelonaCommunityMigrationStore implements BarcelonaCommunityMigrationStore {
  private state: BarcelonaCommunityMigrationState;

  constructor(state: BarcelonaCommunityMigrationState) {
    this.state = {
      communities: state.communities.map((document) => ({ ...document })),
      translations: state.translations.map((document) => ({ ...document })),
      gigs: state.gigs.map(cloneAssignmentDocument),
      gigCandidates: state.gigCandidates.map(cloneAssignmentDocument),
    };
  }

  readState(): Promise<BarcelonaCommunityMigrationState> {
    return Promise.resolve({
      communities: this.state.communities.map((document) => ({ ...document })),
      translations: this.state.translations.map((document) => ({
        ...document,
      })),
      gigs: this.state.gigs.map(cloneAssignmentDocument),
      gigCandidates: this.state.gigCandidates.map(cloneAssignmentDocument),
    });
  }

  insertCommunity(
    community: BarcelonaCommunityInsertDocument,
  ): Promise<BarcelonaCommunityMigrationWriteResult> {
    this.state.communities.push({ ...community });
    return Promise.resolve(this.insertedWriteResult());
  }

  insertEnglishTranslation(
    translation: BarcelonaTranslationInsertDocument,
  ): Promise<BarcelonaCommunityMigrationWriteResult> {
    this.state.translations.push({ ...translation });
    return Promise.resolve(this.insertedWriteResult());
  }

  backfillGigs(
    communityId: Types.ObjectId,
  ): Promise<BarcelonaCommunityMigrationWriteResult> {
    return Promise.resolve(this.backfill(this.state.gigs, communityId));
  }

  backfillGigCandidates(
    communityId: Types.ObjectId,
  ): Promise<BarcelonaCommunityMigrationWriteResult> {
    return Promise.resolve(
      this.backfill(this.state.gigCandidates, communityId),
    );
  }

  private backfill(
    documents: CommunityAssignmentMigrationDocument[],
    communityId: Types.ObjectId,
  ): BarcelonaCommunityMigrationWriteResult {
    let matchedCount = 0;
    for (const document of documents) {
      const hasCommunityIds = Object.prototype.hasOwnProperty.call(
        document,
        'communityIds',
      );
      if (hasCommunityIds) {
        continue;
      }
      matchedCount += 1;
      document.communityIds = [communityId];
    }
    return {
      matchedCount,
      modifiedCount: matchedCount,
      insertedCount: 0,
    };
  }

  private insertedWriteResult(): BarcelonaCommunityMigrationWriteResult {
    return { matchedCount: 0, modifiedCount: 0, insertedCount: 1 };
  }
}

function emptyState(): BarcelonaCommunityMigrationState {
  return {
    communities: [],
    translations: [],
    gigs: [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }],
    gigCandidates: [{ _id: new Types.ObjectId() }],
  };
}

describe('runBarcelonaCommunityMigration', () => {
  it('should plan Community bootstrap, English translation, and assignments without writing during dry run', async () => {
    const store = new InMemoryBarcelonaCommunityMigrationStore(emptyState());

    const report = await runBarcelonaCommunityMigration(store, true, NOW);

    expect(report).toMatchObject({
      mode: 'dry-run',
      canApply: true,
      before: {
        communityRecords: 0,
        translationRecords: 0,
        gigs: { total: 2, missing: 2, valid: 0 },
        gigCandidates: { total: 1, missing: 1, valid: 0 },
      },
      projectedAfter: {
        communityRecords: 1,
        hasExpectedCommunity: true,
        translationRecords: 1,
        hasExpectedEnglishTranslation: true,
        gigs: { total: 2, missing: 0, valid: 2 },
        gigCandidates: { total: 1, missing: 0, valid: 1 },
      },
      writes: {
        community: { insertedCount: 0 },
        englishTranslation: { insertedCount: 0 },
        gigs: { modifiedCount: 0 },
        gigCandidates: { modifiedCount: 0 },
      },
    });
  });

  it('should apply once and make a rerun a no-op', async () => {
    const store = new InMemoryBarcelonaCommunityMigrationStore(emptyState());

    const firstReport = await runBarcelonaCommunityMigration(store, false, NOW);
    const rerunReport = await runBarcelonaCommunityMigration(store, false, NOW);

    expect(firstReport.writes).toEqual({
      community: { matchedCount: 0, modifiedCount: 0, insertedCount: 1 },
      englishTranslation: {
        matchedCount: 0,
        modifiedCount: 0,
        insertedCount: 1,
      },
      gigs: { matchedCount: 2, modifiedCount: 2, insertedCount: 0 },
      gigCandidates: {
        matchedCount: 1,
        modifiedCount: 1,
        insertedCount: 0,
      },
    });
    expect(firstReport.after).toMatchObject({
      hasExpectedCommunity: true,
      hasExpectedEnglishTranslation: true,
      gigs: { missing: 0, valid: 2 },
      gigCandidates: { missing: 0, valid: 1 },
    });
    expect(rerunReport.writes).toEqual({
      community: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      englishTranslation: {
        matchedCount: 0,
        modifiedCount: 0,
        insertedCount: 0,
      },
      gigs: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      gigCandidates: {
        matchedCount: 0,
        modifiedCount: 0,
        insertedCount: 0,
      },
    });
  });

  it('should block conflicting existing assignments without writing', async () => {
    const communityId = new Types.ObjectId();
    const conflictingCommunityId = new Types.ObjectId();
    const store = new InMemoryBarcelonaCommunityMigrationStore({
      communities: [
        {
          _id: communityId,
          countryIso: 'ES',
          slug: 'barcelona',
          nameTranslationKey: 'barcelona.name',
          timeZone: 'Europe/Madrid',
          isActive: true,
        },
      ],
      translations: [],
      gigs: [
        {
          _id: 'gig-conflict',
          communityIds: [conflictingCommunityId],
        },
      ],
      gigCandidates: [],
    });
    const backfillGigsSpy = vi.spyOn(store, 'backfillGigs');

    const report = await runBarcelonaCommunityMigration(store, false, NOW);

    expect(report.canApply).toBe(false);
    expect(report.before.gigs.blockingRecordIds).toEqual(['gig-conflict']);
    expect(backfillGigsSpy).not.toHaveBeenCalled();
  });

  it('should block a conflicting Barcelona Community record', async () => {
    const store = new InMemoryBarcelonaCommunityMigrationStore({
      communities: [
        {
          _id: new Types.ObjectId(),
          countryIso: 'ES',
          slug: 'barcelona',
          nameTranslationKey: 'legacy.name',
          timeZone: 'Europe/Madrid',
          isActive: true,
        },
      ],
      translations: [],
      gigs: [],
      gigCandidates: [],
    });
    const insertCommunitySpy = vi.spyOn(store, 'insertCommunity');

    const report = await runBarcelonaCommunityMigration(store, false, NOW);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingReasons).toContain(
      'The existing Barcelona Community does not match the expected record.',
    );
    expect(insertCommunitySpy).not.toHaveBeenCalled();
  });

  it('should block a conflicting English translation record', async () => {
    const store = new InMemoryBarcelonaCommunityMigrationStore({
      communities: [],
      translations: [
        {
          _id: new Types.ObjectId(),
          locale: 'en',
          namespace: 'community',
          key: 'barcelona.name',
          value: 'Legacy Barcelona',
          format: 'plain',
          kind: 'text',
          isActive: true,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      gigs: [],
      gigCandidates: [],
    });
    const insertTranslationSpy = vi.spyOn(store, 'insertEnglishTranslation');

    const report = await runBarcelonaCommunityMigration(store, false, NOW);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingReasons).toContain(
      'The existing English Barcelona Community translation does not match the expected record.',
    );
    expect(insertTranslationSpy).not.toHaveBeenCalled();
  });
});
