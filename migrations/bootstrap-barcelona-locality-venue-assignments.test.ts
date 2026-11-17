import { Types } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';

import { runBarcelonaLocationMigration } from './1794787200000-bootstrap-barcelona-locality-venue-assignments';
import type {
  BarcelonaLocalityInsertDocument,
  BarcelonaLocationMigrationState,
  BarcelonaLocationMigrationStore,
  BarcelonaLocationMigrationWriteResult,
  GigCandidateLocationBackfill,
  GigCandidateLocationMigrationDocument,
  GigLocationMigrationDocument,
  GigVenueBackfill,
  VenueInsertDocument,
} from './1794787200000-bootstrap-barcelona-locality-venue-assignments';

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneGig(
  document: GigLocationMigrationDocument,
): GigLocationMigrationDocument {
  const clone: GigLocationMigrationDocument = { ...document };
  if (Array.isArray(document.venueIds)) {
    clone.venueIds = [...document.venueIds];
  }
  return clone;
}

function cloneGigCandidate(
  document: GigCandidateLocationMigrationDocument,
): GigCandidateLocationMigrationDocument {
  const clone: GigCandidateLocationMigrationDocument = { ...document };
  if (isRecord(document.gigDraft)) {
    const gigDraft = { ...document.gigDraft };
    clone.gigDraft = gigDraft;
    if (Array.isArray(document.gigDraft.venueIds)) {
      gigDraft.venueIds = [...document.gigDraft.venueIds];
    }
  }
  return clone;
}

function cloneState(
  state: BarcelonaLocationMigrationState,
): BarcelonaLocationMigrationState {
  return {
    localities: state.localities.map((document) => ({ ...document })),
    venues: state.venues.map((document) => ({
      ...document,
      aliases: Array.isArray(document.aliases)
        ? [...document.aliases]
        : document.aliases,
    })),
    gigs: state.gigs.map(cloneGig),
    gigCandidates: state.gigCandidates.map(cloneGigCandidate),
  };
}

class InMemoryBarcelonaLocationMigrationStore implements BarcelonaLocationMigrationStore {
  private state: BarcelonaLocationMigrationState;

  constructor(state: BarcelonaLocationMigrationState) {
    this.state = cloneState(state);
  }

  readState(): Promise<BarcelonaLocationMigrationState> {
    return Promise.resolve(cloneState(this.state));
  }

  insertLocality(
    locality: BarcelonaLocalityInsertDocument,
  ): Promise<BarcelonaLocationMigrationWriteResult> {
    this.state.localities.push({ ...locality });
    return Promise.resolve(this.insertedResult(1));
  }

  insertVenues(
    venues: VenueInsertDocument[],
  ): Promise<BarcelonaLocationMigrationWriteResult> {
    this.state.venues.push(
      ...venues.map((venue) => ({ ...venue, aliases: [...venue.aliases] })),
    );
    return Promise.resolve(this.insertedResult(venues.length));
  }

  backfillGigs(
    backfills: GigVenueBackfill[],
  ): Promise<BarcelonaLocationMigrationWriteResult> {
    let modifiedCount = 0;
    for (const backfill of backfills) {
      const document = this.state.gigs.find(
        (gig) =>
          gig._id instanceof Types.ObjectId && gig._id.equals(backfill.id),
      );
      if (document === undefined || hasOwn(document, 'venueIds')) {
        continue;
      }
      document.venueIds = [...backfill.venueIds];
      modifiedCount += 1;
    }
    return Promise.resolve(this.updatedResult(modifiedCount));
  }

  backfillGigCandidates(
    backfills: GigCandidateLocationBackfill[],
  ): Promise<BarcelonaLocationMigrationWriteResult> {
    let modifiedCount = 0;
    for (const backfill of backfills) {
      const document = this.state.gigCandidates.find(
        (gigCandidate) =>
          gigCandidate._id instanceof Types.ObjectId &&
          gigCandidate._id.equals(backfill.id),
      );
      if (
        document === undefined ||
        !isRecord(document.gigDraft) ||
        hasOwn(document, 'localityId') ||
        hasOwn(document.gigDraft, 'venueIds')
      ) {
        continue;
      }

      if (backfill.kind === 'locality') {
        document.localityId = backfill.localityId;
      } else {
        document.gigDraft.venueIds = [...backfill.venueIds];
      }
      modifiedCount += 1;
    }
    return Promise.resolve(this.updatedResult(modifiedCount));
  }

  private insertedResult(
    insertedCount: number,
  ): BarcelonaLocationMigrationWriteResult {
    return { matchedCount: 0, modifiedCount: 0, insertedCount };
  }

  private updatedResult(
    modifiedCount: number,
  ): BarcelonaLocationMigrationWriteResult {
    return {
      matchedCount: modifiedCount,
      modifiedCount,
      insertedCount: 0,
    };
  }
}

function buildLegacyState(): BarcelonaLocationMigrationState {
  return {
    localities: [],
    venues: [],
    gigs: [
      { _id: new Types.ObjectId(), venue: ' Razzmatazz ' },
      { _id: new Types.ObjectId(), venue: 'RAZZMATAZZ' },
    ],
    gigCandidates: [
      {
        _id: new Types.ObjectId(),
        status: 'Reviewing',
        gigDraft: { venue: 'Palau Sant Jordi' },
      },
      {
        _id: new Types.ObjectId(),
        status: 'New',
        gigDraft: {},
      },
    ],
  };
}

describe('runBarcelonaLocationMigration', () => {
  it('should report the complete catalog and assignment plan without writing during dry run', async () => {
    const store = new InMemoryBarcelonaLocationMigrationStore(
      buildLegacyState(),
    );

    const report = await runBarcelonaLocationMigration(store, true);
    const state = await store.readState();

    expect(report).toMatchObject({
      mode: 'dry-run',
      plannedVenueNames: ['Palau Sant Jordi', 'Razzmatazz'],
      canApply: true,
      before: {
        catalog: {
          localityRecords: 0,
          hasUsableLocality: false,
          requiredVenueNames: ['Palau Sant Jordi', 'Razzmatazz'],
          missingVenueNames: ['Palau Sant Jordi', 'Razzmatazz'],
        },
        gigs: {
          total: 2,
          missing: 2,
          valid: 0,
          venueBackfills: 2,
        },
        gigCandidates: {
          total: 2,
          missing: 2,
          valid: 0,
          venueBackfills: 1,
          localityBackfills: 1,
        },
      },
      projectedAfter: {
        catalog: {
          localityRecords: 1,
          hasUsableLocality: true,
          missingVenueNames: [],
        },
        gigs: { missing: 0, valid: 2 },
        gigCandidates: { missing: 0, valid: 2 },
        blockingReasons: [],
      },
      writes: {
        locality: { insertedCount: 0 },
        venues: { insertedCount: 0 },
        gigs: { modifiedCount: 0 },
        gigCandidates: { modifiedCount: 0 },
      },
    });
    expect(state.localities).toHaveLength(0);
    expect(state.venues).toHaveLength(0);
    expect(state.gigs.every((gig) => !hasOwn(gig, 'venueIds'))).toBe(true);
  });

  it('should apply once and make a rerun a no-op', async () => {
    const store = new InMemoryBarcelonaLocationMigrationStore(
      buildLegacyState(),
    );

    const firstReport = await runBarcelonaLocationMigration(store, false);
    const appliedState = await store.readState();
    const rerunReport = await runBarcelonaLocationMigration(store, false);

    expect(firstReport.writes).toEqual({
      locality: { matchedCount: 0, modifiedCount: 0, insertedCount: 1 },
      venues: { matchedCount: 0, modifiedCount: 0, insertedCount: 2 },
      gigs: { matchedCount: 2, modifiedCount: 2, insertedCount: 0 },
      gigCandidates: {
        matchedCount: 2,
        modifiedCount: 2,
        insertedCount: 0,
      },
    });
    expect(appliedState.localities).toEqual([
      expect.objectContaining({
        countryIso: 'ES',
        name: 'Barcelona',
        aliases: [],
        timeZone: 'Europe/Madrid',
      }),
    ]);
    expect(appliedState.venues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Razzmatazz', isActive: true }),
        expect.objectContaining({ name: 'Palau Sant Jordi', isActive: true }),
      ]),
    );
    expect(appliedState.gigs[0].venueIds).toEqual(
      appliedState.gigs[1].venueIds,
    );
    expect(appliedState.gigCandidates[0]).toMatchObject({
      gigDraft: { venueIds: [expect.any(Types.ObjectId)] },
    });
    expect(appliedState.gigCandidates[1]).toMatchObject({
      localityId: expect.any(Types.ObjectId),
      gigDraft: {},
    });
    expect(rerunReport.writes).toEqual({
      locality: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      venues: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      gigs: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      gigCandidates: {
        matchedCount: 0,
        modifiedCount: 0,
        insertedCount: 0,
      },
    });
  });

  it('should reuse an existing Barcelona Locality and Venue', async () => {
    const localityId = new Types.ObjectId();
    const venueId = new Types.ObjectId();
    const store = new InMemoryBarcelonaLocationMigrationStore({
      localities: [
        {
          _id: localityId,
          countryIso: 'ES',
          name: 'Barcelona',
          aliases: ['BCN'],
          timeZone: 'Europe/Madrid',
        },
      ],
      venues: [
        {
          _id: venueId,
          localityId,
          name: 'Razzmatazz',
          aliases: [],
          isActive: false,
        },
      ],
      gigs: [{ _id: new Types.ObjectId(), venue: 'razzmatazz' }],
      gigCandidates: [],
    });

    const report = await runBarcelonaLocationMigration(store, false);
    const state = await store.readState();

    expect(report.plannedVenueNames).toEqual([]);
    expect(report.writes.locality.insertedCount).toBe(0);
    expect(report.writes.venues.insertedCount).toBe(0);
    expect(state.gigs[0].venueIds).toEqual([venueId]);
  });

  it('should block an Approved GigCandidate without a legacy Venue', async () => {
    const store = new InMemoryBarcelonaLocationMigrationStore({
      localities: [],
      venues: [],
      gigs: [],
      gigCandidates: [
        {
          _id: new Types.ObjectId(),
          status: 'Approved',
          gigDraft: {},
        },
      ],
    });
    const insertLocalitySpy = vi.spyOn(store, 'insertLocality');

    const report = await runBarcelonaLocationMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.gigCandidates.blockingRecordIds).toHaveLength(1);
    expect(insertLocalitySpy).not.toHaveBeenCalled();
  });

  it('should block a Gig without a usable legacy Venue', async () => {
    const gigId = new Types.ObjectId();
    const store = new InMemoryBarcelonaLocationMigrationStore({
      localities: [],
      venues: [],
      gigs: [{ _id: gigId, venue: '   ' }],
      gigCandidates: [],
    });

    const report = await runBarcelonaLocationMigration(store, true);

    expect(report.canApply).toBe(false);
    expect(report.before.gigs.blockingRecordIds).toEqual([gigId.toHexString()]);
  });

  it('should block simultaneous GigCandidate Locality and Venue assignments', async () => {
    const localityId = new Types.ObjectId();
    const venueId = new Types.ObjectId();
    const gigCandidateId = new Types.ObjectId();
    const store = new InMemoryBarcelonaLocationMigrationStore({
      localities: [
        {
          _id: localityId,
          countryIso: 'ES',
          name: 'Barcelona',
          aliases: [],
          timeZone: 'Europe/Madrid',
        },
      ],
      venues: [
        {
          _id: venueId,
          localityId,
          name: 'Razzmatazz',
          aliases: [],
          isActive: true,
        },
      ],
      gigs: [],
      gigCandidates: [
        {
          _id: gigCandidateId,
          status: 'Reviewing',
          localityId,
          gigDraft: { venueIds: [venueId] },
        },
      ],
    });

    const report = await runBarcelonaLocationMigration(store, true);

    expect(report.canApply).toBe(false);
    expect(report.before.gigCandidates.blockingRecordIds).toEqual([
      gigCandidateId.toHexString(),
    ]);
  });
});
