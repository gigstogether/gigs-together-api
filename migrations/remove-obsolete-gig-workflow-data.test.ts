import {
  buildObsoleteGigWorkflowSnapshot,
  runObsoleteGigWorkflowCleanup,
} from './1789603200000-remove-obsolete-gig-workflow-data';
import type {
  ObsoleteGigWorkflowMigrationStore,
  ObsoleteGigWorkflowState,
  ObsoleteGigWorkflowWriteCount,
} from './1789603200000-remove-obsolete-gig-workflow-data';

const GIG_ID = '66a000000000000000000101';
const GIG_CANDIDATE_ID = '66a000000000000000000201';
const REJECTED_GIG_CANDIDATE_ID = '66a000000000000000000202';
const ADMIN_USER_ID = '66a000000000000000000301';

function validState(): ObsoleteGigWorkflowState {
  return {
    gigs: [
      {
        _id: GIG_ID,
        source: {
          type: 'user',
          userId: ADMIN_USER_ID,
          origin: { type: 'admin' },
        },
        status: 'Published',
        suggestedBy: {
          userId: 42,
          feedbackMessageId: 777,
        },
        gigCandidateId: GIG_CANDIDATE_ID,
      },
    ],
    gigCandidates: [
      {
        _id: GIG_CANDIDATE_ID,
        source: {
          type: 'user',
          userId: ADMIN_USER_ID,
          origin: { type: 'admin' },
          originalText: 'Original submission',
          attachments: [{ fileId: 'attachment-1' }],
        },
        status: 'Approved',
        gigId: GIG_ID,
      },
      {
        _id: REJECTED_GIG_CANDIDATE_ID,
        source: {
          type: 'user',
          userId: ADMIN_USER_ID,
          origin: { type: 'admin' },
          originalText: 'Rejected submission',
        },
        status: 'Rejected',
      },
    ],
    users: [
      {
        _id: ADMIN_USER_ID,
        status: 'active',
        roles: ['admin'],
        identities: [
          {
            type: 'messenger',
            messenger: 'Telegram',
            externalUserId: '42',
          },
        ],
      },
    ],
    hasLegacyAdminsCollection: true,
    legacyAdmins: [
      {
        _id: '66a000000000000000000401',
        telegramId: 42,
        isActive: true,
      },
    ],
    obsoleteTranslations: [
      {
        _id: '66a000000000000000000501',
        namespace: 'telegram',
        key: 'submissionFeedback',
      },
      {
        _id: '66a000000000000000000502',
        namespace: 'telegram',
        key: 'status.accepted',
      },
    ],
    gigIndexes: [
      { name: '_id_', key: { _id: 1 } },
      { name: 'publicId_1', key: { publicId: 1 } },
      {
        name: 'country_1_city_1',
        key: { country: 1, city: 1 },
        collationLocale: 'en',
        collationStrength: 2,
      },
      {
        name: 'isVisible_1_country_1_city_1_date_1__id_1',
        key: { isVisible: 1, country: 1, city: 1, date: 1, _id: 1 },
        collationLocale: 'en',
        collationStrength: 2,
      },
      {
        name: 'gigCandidateId_1',
        key: { gigCandidateId: 1 },
      },
      {
        name: 'status_1_date_1',
        key: { status: 1, date: 1 },
      },
    ],
  };
}

class InMemoryObsoleteGigWorkflowStore implements ObsoleteGigWorkflowMigrationStore {
  private state: ObsoleteGigWorkflowState;
  writeCalls = 0;

  constructor(state: ObsoleteGigWorkflowState) {
    this.state = structuredClone(state);
  }

  readState(): Promise<ObsoleteGigWorkflowState> {
    return Promise.resolve(structuredClone(this.state));
  }

  removeLegacyGigFields(): Promise<ObsoleteGigWorkflowWriteCount> {
    this.writeCalls += 1;
    let modifiedCount = 0;
    for (const gig of this.state.gigs) {
      const hasLegacyFields =
        Object.prototype.hasOwnProperty.call(gig, 'suggestedBy') ||
        Object.prototype.hasOwnProperty.call(gig, 'status') ||
        Object.prototype.hasOwnProperty.call(gig, 'gigCandidateId');
      if (hasLegacyFields) {
        modifiedCount += 1;
        delete gig.suggestedBy;
        delete gig.status;
        delete gig.gigCandidateId;
      }
    }
    return Promise.resolve({ matchedCount: modifiedCount, modifiedCount });
  }

  deleteObsoleteTranslations(): Promise<number> {
    this.writeCalls += 1;
    const deletedCount = this.state.obsoleteTranslations.length;
    this.state.obsoleteTranslations = [];
    return Promise.resolve(deletedCount);
  }

  dropLegacyAdminsCollection(): Promise<boolean> {
    this.writeCalls += 1;
    if (!this.state.hasLegacyAdminsCollection) {
      return Promise.resolve(false);
    }
    this.state.hasLegacyAdminsCollection = false;
    this.state.legacyAdmins = [];
    return Promise.resolve(true);
  }

  dropGigIndexes(indexNames: string[]): Promise<string[]> {
    this.writeCalls += 1;
    const names = new Set(indexNames);
    this.state.gigIndexes = this.state.gigIndexes.filter(
      (index) => !names.has(index.name),
    );
    return Promise.resolve([...indexNames]);
  }
}

describe('runObsoleteGigWorkflowCleanup', () => {
  it('should report a dry run without writing or changing retained GigCandidates', async () => {
    const store = new InMemoryObsoleteGigWorkflowStore(validState());

    const report = await runObsoleteGigWorkflowCleanup(store, true);
    const stateAfterDryRun = await store.readState();

    expect(report).toMatchObject({
      mode: 'dry-run',
      canApply: true,
      plannedWrites: {
        gigDocuments: 1,
        translationDocuments: 2,
        legacyAdminDocuments: 1,
        legacyAdminsCollection: 1,
        gigIndexes: ['country_1_city_1', 'gigCandidateId_1', 'status_1_date_1'],
      },
      projectedAfter: {
        gigDocumentsWithObsoleteFields: 0,
        legacyAdminsCollectionExists: false,
        obsoleteTranslationDocuments: 0,
        obsoleteGigIndexNames: [],
        approvedGigCandidates: 1,
        rejectedGigCandidates: 1,
        gigCandidatesWithOriginalText: 2,
        gigCandidatesWithAttachments: 1,
      },
    });
    expect(store.writeCalls).toBe(0);
    expect(stateAfterDryRun.gigCandidates).toEqual(validState().gigCandidates);
  });

  it('should apply cleanup once and make a rerun a no-op', async () => {
    const store = new InMemoryObsoleteGigWorkflowStore(validState());

    const firstReport = await runObsoleteGigWorkflowCleanup(store, false);
    const firstWriteCalls = store.writeCalls;
    const secondReport = await runObsoleteGigWorkflowCleanup(store, false);
    const stateAfterRerun = await store.readState();

    expect(firstReport.after).toMatchObject({
      gigDocumentsWithObsoleteFields: 0,
      legacyAdminsCollectionExists: false,
      obsoleteTranslationDocuments: 0,
      obsoleteGigIndexNames: [],
      blockingRecordIds: [],
    });
    expect(secondReport.plannedWrites).toEqual({
      gigDocuments: 0,
      translationDocuments: 0,
      legacyAdminDocuments: 0,
      legacyAdminsCollection: 0,
      gigIndexes: [],
    });
    expect(store.writeCalls).toBe(firstWriteCalls);
    expect(stateAfterRerun.gigCandidates).toEqual(validState().gigCandidates);
  });

  it('should block cleanup when source, relationship, or admin cutover is ambiguous', async () => {
    const state = validState();
    state.gigs[0].source = null;
    state.gigCandidates[0].gigId = '66a000000000000000000999';
    state.users[0].identities = [];
    const store = new InMemoryObsoleteGigWorkflowStore(state);

    const report = await runObsoleteGigWorkflowCleanup(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.invalidGigSourceIds).toEqual([GIG_ID]);
    expect(report.before.invalidGigCandidateRelationshipIds).toEqual([
      GIG_ID,
      GIG_CANDIDATE_ID,
    ]);
    expect(report.before.unmatchedActiveLegacyAdminIds).toEqual([
      '66a000000000000000000401',
    ]);
    expect(store.writeCalls).toBe(0);
  });

  it('should require the location-aware visible feed index', () => {
    const state = validState();
    state.gigIndexes = state.gigIndexes.filter(
      (index) => !index.name.startsWith('isVisible_1_'),
    );

    const snapshot = buildObsoleteGigWorkflowSnapshot(state);

    expect(snapshot.hasRequiredVisibleFeedIndex).toBe(false);
  });

  it('should block unknown GigCandidate fields instead of deleting them', async () => {
    const state = validState();
    state.gigCandidates[1].feedbackMessageId = 123;
    const store = new InMemoryObsoleteGigWorkflowStore(state);

    const report = await runObsoleteGigWorkflowCleanup(store, false);

    expect(report.before.gigCandidatesWithObsoleteFields).toEqual([
      REJECTED_GIG_CANDIDATE_ID,
    ]);
    expect(report.canApply).toBe(false);
    expect(store.writeCalls).toBe(0);
  });
});
