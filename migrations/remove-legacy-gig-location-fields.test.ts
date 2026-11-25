import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { isRecord } from '@shared/utils/is-record';

import { runLegacyLocationCleanup } from './1795564800000-remove-legacy-gig-location-fields';
import type {
  LegacyLocationCleanupGigCandidateDocument,
  LegacyLocationCleanupGigDocument,
  LegacyLocationCleanupState,
  LegacyLocationCleanupStore,
  LegacyLocationCleanupWriteResult,
  LegacyTranslationCleanupWriteResult,
} from './1795564800000-remove-legacy-gig-location-fields';

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneGig(
  document: LegacyLocationCleanupGigDocument,
): LegacyLocationCleanupGigDocument {
  const clone = { ...document };
  if (Array.isArray(document.venueIds)) {
    clone.venueIds = [...document.venueIds];
  }
  return clone;
}

function cloneGigCandidate(
  document: LegacyLocationCleanupGigCandidateDocument,
): LegacyLocationCleanupGigCandidateDocument {
  const clone = { ...document };
  if (isRecord(document.gigDraft)) {
    clone.gigDraft = { ...document.gigDraft };
    if (isRecord(clone.gigDraft) && Array.isArray(document.gigDraft.venueIds)) {
      clone.gigDraft.venueIds = [...document.gigDraft.venueIds];
    }
  }
  return clone;
}

function cloneState(
  state: LegacyLocationCleanupState,
): LegacyLocationCleanupState {
  return {
    localities: state.localities.map((document) => ({ ...document })),
    venues: state.venues.map((document) => ({ ...document })),
    gigs: state.gigs.map(cloneGig),
    gigCandidates: state.gigCandidates.map(cloneGigCandidate),
    translations: state.translations.map((document) => ({ ...document })),
  };
}

class InMemoryLegacyLocationCleanupStore implements LegacyLocationCleanupStore {
  private state: LegacyLocationCleanupState;

  constructor(state: LegacyLocationCleanupState) {
    this.state = cloneState(state);
  }

  readState(): Promise<LegacyLocationCleanupState> {
    return Promise.resolve(cloneState(this.state));
  }

  removeLegacyGigLocationFields(): Promise<LegacyLocationCleanupWriteResult> {
    let modifiedCount = 0;
    for (const gig of this.state.gigs) {
      if (
        !hasOwn(gig, 'city') &&
        !hasOwn(gig, 'country') &&
        !hasOwn(gig, 'venue')
      ) {
        continue;
      }
      delete gig.city;
      delete gig.country;
      delete gig.venue;
      modifiedCount += 1;
    }
    return Promise.resolve({ matchedCount: modifiedCount, modifiedCount });
  }

  removeLegacyGigCandidateLocationFields(): Promise<LegacyLocationCleanupWriteResult> {
    let modifiedCount = 0;
    for (const gigCandidate of this.state.gigCandidates) {
      if (!isRecord(gigCandidate.gigDraft)) {
        continue;
      }
      const gigDraft = gigCandidate.gigDraft;
      if (
        !hasOwn(gigDraft, 'city') &&
        !hasOwn(gigDraft, 'country') &&
        !hasOwn(gigDraft, 'venue')
      ) {
        continue;
      }
      delete gigDraft.city;
      delete gigDraft.country;
      delete gigDraft.venue;
      modifiedCount += 1;
    }
    return Promise.resolve({ matchedCount: modifiedCount, modifiedCount });
  }

  removeLegacyLocationTranslations(): Promise<LegacyTranslationCleanupWriteResult> {
    const beforeCount = this.state.translations.length;
    this.state.translations = this.state.translations.filter(
      ({ namespace }) => namespace !== 'city' && namespace !== 'country',
    );
    return Promise.resolve({
      deletedCount: beforeCount - this.state.translations.length,
    });
  }
}

interface ValidStateFixture {
  state: LegacyLocationCleanupState;
  localityId: Types.ObjectId;
  venueId: Types.ObjectId;
}

function createValidState(): ValidStateFixture {
  const localityId = new Types.ObjectId();
  const venueId = new Types.ObjectId();

  return {
    localityId,
    venueId,
    state: {
      localities: [{ _id: localityId }],
      venues: [{ _id: venueId, localityId }],
      gigs: [
        {
          _id: new Types.ObjectId(),
          venueIds: [venueId],
          city: 'Barcelona',
          country: 'ES',
          venue: 'Razzmatazz',
        },
      ],
      gigCandidates: [
        {
          _id: new Types.ObjectId(),
          status: 'Approved',
          gigDraft: {
            venueIds: [venueId],
            city: 'Barcelona',
            country: 'ES',
            venue: 'Razzmatazz',
          },
        },
      ],
      translations: [
        { _id: new Types.ObjectId(), namespace: 'city' },
        { _id: new Types.ObjectId(), namespace: 'country' },
        { _id: new Types.ObjectId(), namespace: 'common' },
      ],
    },
  };
}

describe('runLegacyLocationCleanup', () => {
  it('should project cleanup without writing during dry run', async () => {
    const { state } = createValidState();
    const store = new InMemoryLegacyLocationCleanupStore(state);
    const removeGigsSpy = vi.spyOn(store, 'removeLegacyGigLocationFields');
    const removeGigCandidatesSpy = vi.spyOn(
      store,
      'removeLegacyGigCandidateLocationFields',
    );
    const removeTranslationsSpy = vi.spyOn(
      store,
      'removeLegacyLocationTranslations',
    );

    const report = await runLegacyLocationCleanup(store, true);

    expect(report.canApply).toBe(true);
    expect(report.before.gigs.legacyFields).toEqual({
      city: 1,
      country: 1,
      venue: 1,
    });
    expect(report.before.gigCandidates.legacyFields).toEqual({
      city: 1,
      country: 1,
      venue: 1,
    });
    expect(report.before.translations).toEqual({ city: 1, country: 1 });
    expect(report.projectedAfter.gigs.legacyFields).toEqual({
      city: 0,
      country: 0,
      venue: 0,
    });
    expect(report.projectedAfter.translations).toEqual({ city: 0, country: 0 });
    expect(report.after).toEqual(report.before);
    expect(removeGigsSpy).not.toHaveBeenCalled();
    expect(removeGigCandidatesSpy).not.toHaveBeenCalled();
    expect(removeTranslationsSpy).not.toHaveBeenCalled();
  });

  it('should remove legacy fields and translations when applying', async () => {
    const { state } = createValidState();
    const store = new InMemoryLegacyLocationCleanupStore(state);

    const report = await runLegacyLocationCleanup(store, false);
    const afterState = await store.readState();

    expect(report.canApply).toBe(true);
    expect(report.writes.gigs).toEqual({ matchedCount: 1, modifiedCount: 1 });
    expect(report.writes.gigCandidates).toEqual({
      matchedCount: 1,
      modifiedCount: 1,
    });
    expect(report.writes.translations).toEqual({ deletedCount: 2 });
    expect(report.after.gigs.legacyFields).toEqual({
      city: 0,
      country: 0,
      venue: 0,
    });
    expect(report.after.gigCandidates.legacyFields).toEqual({
      city: 0,
      country: 0,
      venue: 0,
    });
    expect(afterState.translations).toHaveLength(1);
    expect(afterState.translations[0].namespace).toBe('common');
  });

  it('should make a repeated apply a no-op', async () => {
    const { state } = createValidState();
    const store = new InMemoryLegacyLocationCleanupStore(state);
    await runLegacyLocationCleanup(store, false);

    const report = await runLegacyLocationCleanup(store, false);

    expect(report.canApply).toBe(true);
    expect(report.writes).toEqual({
      gigs: { matchedCount: 0, modifiedCount: 0 },
      gigCandidates: { matchedCount: 0, modifiedCount: 0 },
      translations: { deletedCount: 0 },
    });
  });

  it('should block a Gig without a valid Venue assignment', async () => {
    const { state } = createValidState();
    const gigId = new Types.ObjectId();
    state.gigs = [{ _id: gigId, venueIds: [] }];
    const store = new InMemoryLegacyLocationCleanupStore(state);
    const removeGigsSpy = vi.spyOn(store, 'removeLegacyGigLocationFields');

    const report = await runLegacyLocationCleanup(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.gigs.blockingRecordIds).toEqual([gigId.toHexString()]);
    expect(report.before.blockingReasons[0]).toContain(
      'Venue assignment must contain at least one Venue ObjectId.',
    );
    expect(removeGigsSpy).not.toHaveBeenCalled();
  });

  it('should block Venues from different Localities in one Gig', async () => {
    const { state, venueId } = createValidState();
    const secondLocalityId = new Types.ObjectId();
    const secondVenueId = new Types.ObjectId();
    state.localities.push({ _id: secondLocalityId });
    state.venues.push({ _id: secondVenueId, localityId: secondLocalityId });
    state.gigs[0].venueIds = [venueId, secondVenueId];
    const store = new InMemoryLegacyLocationCleanupStore(state);

    const report = await runLegacyLocationCleanup(store, true);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingReasons[0]).toContain(
      'All Venues in one assignment must belong to the same Locality.',
    );
  });

  it('should block simultaneous GigCandidate Locality and Venue assignments', async () => {
    const { state, localityId, venueId } = createValidState();
    const gigCandidateId = new Types.ObjectId();
    state.gigCandidates = [
      {
        _id: gigCandidateId,
        status: 'Reviewing',
        localityId,
        gigDraft: { venueIds: [venueId] },
      },
    ];
    const store = new InMemoryLegacyLocationCleanupStore(state);

    const report = await runLegacyLocationCleanup(store, true);

    expect(report.canApply).toBe(false);
    expect(report.before.gigCandidates.blockingRecordIds).toEqual([
      gigCandidateId.toHexString(),
    ]);
    expect(report.before.blockingReasons[0]).toContain(
      'localityId and gigDraft.venueIds must not coexist.',
    );
  });

  it('should block an Approved GigCandidate without a Venue assignment', async () => {
    const { state, localityId } = createValidState();
    const gigCandidateId = new Types.ObjectId();
    state.gigCandidates = [
      {
        _id: gigCandidateId,
        status: 'Approved',
        localityId,
        gigDraft: {},
      },
    ];
    const store = new InMemoryLegacyLocationCleanupStore(state);

    const report = await runLegacyLocationCleanup(store, true);

    expect(report.canApply).toBe(false);
    expect(report.before.gigCandidates.blockingRecordIds).toEqual([
      gigCandidateId.toHexString(),
    ]);
    expect(report.before.blockingReasons[0]).toContain(
      'Approved GigCandidate must have a Venue assignment.',
    );
  });

  it('should allow a non-approved GigCandidate without a location', async () => {
    const { state } = createValidState();
    state.gigCandidates = [
      {
        _id: new Types.ObjectId(),
        status: 'New',
        gigDraft: {},
      },
    ];
    const store = new InMemoryLegacyLocationCleanupStore(state);

    const report = await runLegacyLocationCleanup(store, true);

    expect(report.canApply).toBe(true);
    expect(report.before.gigCandidates.valid).toBe(1);
  });
});
