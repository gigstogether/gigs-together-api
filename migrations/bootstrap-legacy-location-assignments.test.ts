import { Types } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';

import { runLegacyLocationMigration } from './1794787200000-bootstrap-legacy-location-assignments';
import type {
  GigCandidateLocationBackfill,
  GigCandidateLocationMigrationDocument,
  GigLocationMigrationDocument,
  GigVenueBackfill,
  LegacyLocationMigrationState,
  LegacyLocationMigrationStore,
  LocalityInsertDocument,
  LocationMigrationWriteResult,
  VenueInsertDocument,
} from './1794787200000-bootstrap-legacy-location-assignments';

const AUDITED_PRODUCTION_VENUE_NAMES = [
  'Apolo',
  'Apolo 2',
  'Auditori Forum CCIB',
  'Bar Ceferino, Barcelona',
  'Benicássim',
  'Boveda',
  'Casa Montjuïc',
  'ESTADI OLÍMPIC LLUIS',
  'Estadi Olímpic Lluís Companys',
  'Estraperlo Club, Badalona',
  'Heliogábal',
  'Jamboree Sala 1',
  'Ku',
  'Kvartirnik, Carrer de Villarroel 79',
  'La (2) de Apolo',
  'La 2 de Apollo',
  'La 2 de Apolo',
  'La Carpa (Poble Espanyol)',
  'La Nau',
  'La(2)',
  'Laut',
  'Lluís Companys Olympic Stadium',
  'Meteoro',
  'Moll de Barcelona',
  'Olimpic Arena',
  'Olimpic Arena Badalona',
  'Opium',
  'PALAU SANT JORDI',
  'Palau Olímpic Badalona',
  'Palau San Jordi',
  'Palau Sant Jordi',
  'Paral-lel 62',
  'Parallel 62',
  'Paral·lel 62',
  'Parc de Can Zam',
  'Parc de Can Zam (Santa Coloma de Gramenet)',
  'Parc de la Trinitat',
  'Parc del Fòrum',
  'Parc del Fórum',
  'Poble Espanyol',
  'Razzmatazz',
  'Razzmatazz 1',
  'Razzmatazz 2',
  'Razzmatazz 2, Barcelona',
  'Razzmatazz 3',
  'Rouge Cocktail Club',
  'Sala Apolo',
  'Sala Bikini',
  'Sala Bikini Barcelona',
  'Sala La Nau',
  'Sala Paral·lel 62',
  'Sala Razzmatazz 2',
  'Sala Sidecar',
  'Sala Upload',
  'Sala Wolf',
  'Salamandra',
  'Salamandra (L’Hospitalet de Llobregat)',
  'Salamandra - Sala 1',
  'Sant Jordi',
  'Sant Jordi Club',
  'WOLF',
  'Jardins del Palau de Pedralbes',
];

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
  state: LegacyLocationMigrationState,
): LegacyLocationMigrationState {
  return {
    localities: state.localities.map((document) => ({
      ...document,
      aliases: Array.isArray(document.aliases)
        ? [...document.aliases]
        : document.aliases,
    })),
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

class InMemoryLegacyLocationMigrationStore implements LegacyLocationMigrationStore {
  private state: LegacyLocationMigrationState;

  constructor(state: LegacyLocationMigrationState) {
    this.state = cloneState(state);
  }

  readState(): Promise<LegacyLocationMigrationState> {
    return Promise.resolve(cloneState(this.state));
  }

  insertLocalities(
    localities: LocalityInsertDocument[],
  ): Promise<LocationMigrationWriteResult> {
    this.state.localities.push(
      ...localities.map((locality) => ({
        ...locality,
        aliases: [...locality.aliases],
      })),
    );
    return Promise.resolve(this.insertedResult(localities.length));
  }

  insertVenues(
    venues: VenueInsertDocument[],
  ): Promise<LocationMigrationWriteResult> {
    this.state.venues.push(
      ...venues.map((venue) => ({ ...venue, aliases: [...venue.aliases] })),
    );
    return Promise.resolve(this.insertedResult(venues.length));
  }

  backfillGigs(
    backfills: GigVenueBackfill[],
  ): Promise<LocationMigrationWriteResult> {
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
  ): Promise<LocationMigrationWriteResult> {
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

  private insertedResult(insertedCount: number): LocationMigrationWriteResult {
    return { matchedCount: 0, modifiedCount: 0, insertedCount };
  }

  private updatedResult(modifiedCount: number): LocationMigrationWriteResult {
    return {
      matchedCount: modifiedCount,
      modifiedCount,
      insertedCount: 0,
    };
  }
}

function buildLegacyState(): LegacyLocationMigrationState {
  return {
    localities: [],
    venues: [],
    gigs: [
      { _id: new Types.ObjectId(), venue: ' Razzmatazz ' },
      { _id: new Types.ObjectId(), venue: 'RAZZMATAZZ' },
      { _id: new Types.ObjectId(), venue: 'Olimpic Arena Badalona' },
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

describe('runLegacyLocationMigration', () => {
  it('should map every audited production Venue value without a fallback', async () => {
    const gigs = AUDITED_PRODUCTION_VENUE_NAMES.map((venue) => ({
      _id: new Types.ObjectId(),
      venue,
    }));
    const store = new InMemoryLegacyLocationMigrationStore({
      localities: [],
      venues: [],
      gigs,
      gigCandidates: [],
    });

    const report = await runLegacyLocationMigration(store, true);

    expect(report.canApply).toBe(true);
    expect(report.fallbackVenueAssignments).toEqual([]);
    expect(report.plannedLocalityNames).toEqual(['Barcelona', 'Benicàssim']);
    expect(report.plannedVenueNames).toHaveLength(37);
  });

  it('should assign metropolitan Venue records to the Barcelona Locality', async () => {
    const venueNames = [
      'Estraperlo Club, Badalona',
      'Olimpic Arena Badalona',
      'Parc de Can Zam (Santa Coloma de Gramenet)',
      'Salamandra (L’Hospitalet de Llobregat)',
    ];
    const store = new InMemoryLegacyLocationMigrationStore({
      localities: [],
      venues: [],
      gigs: venueNames.map((venue) => ({
        _id: new Types.ObjectId(),
        venue,
      })),
      gigCandidates: [],
    });

    await runLegacyLocationMigration(store, false);
    const state = await store.readState();
    const localityId = state.localities[0]?._id;

    expect(state.localities).toEqual([
      expect.objectContaining({ name: 'Barcelona' }),
    ]);
    expect(localityId).toBeInstanceOf(Types.ObjectId);
    expect(state.venues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'DosRombos',
          localityId,
        }),
        expect.objectContaining({
          name: 'Palau Olímpic de Badalona',
          localityId,
        }),
        expect.objectContaining({ name: 'Parc de Can Zam', localityId }),
        expect.objectContaining({ name: 'Salamandra', localityId }),
      ]),
    );
  });

  it('should map legacy names without persisting technical variants as aliases', async () => {
    const store = new InMemoryLegacyLocationMigrationStore({
      localities: [],
      venues: [],
      gigs: [
        { _id: new Types.ObjectId(), venue: 'Estraperlo Club' },
        { _id: new Types.ObjectId(), venue: 'Club Sauvage' },
        { _id: new Types.ObjectId(), venue: 'Pacha Barcelona' },
        { _id: new Types.ObjectId(), venue: 'Bar Ceferino, Barcelona' },
        { _id: new Types.ObjectId(), venue: 'Boveda' },
        { _id: new Types.ObjectId(), venue: 'La 2 de Apollo' },
        { _id: new Types.ObjectId(), venue: 'Sala Razzmatazz' },
        {
          _id: new Types.ObjectId(),
          venue: 'Sala Razzmatazz (Barcelona, ES)',
        },
        { _id: new Types.ObjectId(), venue: 'Sala Razzmatazz 3' },
        { _id: new Types.ObjectId(), venue: 'Razzmatazz 2, Barcelona' },
      ],
      gigCandidates: [],
    });

    const report = await runLegacyLocationMigration(store, false);
    const state = await store.readState();

    expect(state.venues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'DosRombos',
          aliases: ['Estraperlo Club', 'Estraperlo Club del Ritme'],
        }),
        expect.objectContaining({
          name: 'Sala Sidecar',
          aliases: ['Club Sauvage'],
        }),
        expect.objectContaining({
          name: 'Ku Barcelona',
          aliases: ['Ku', 'Pacha Barcelona'],
        }),
        expect.objectContaining({ name: 'Bar Ceferino', aliases: [] }),
        expect.objectContaining({ name: 'Bóveda', aliases: [] }),
        expect.objectContaining({
          name: 'La (2) de Apolo',
          aliases: ['Apolo 2'],
        }),
        expect.objectContaining({
          name: 'Razzmatazz 2',
          aliases: ['Sala Razzmatazz 2'],
        }),
        expect.objectContaining({
          name: 'Razzmatazz',
          aliases: ['Razzmatazz 1', 'Sala Razzmatazz'],
        }),
        expect.objectContaining({
          name: 'Razzmatazz 3',
          aliases: ['Sala Razzmatazz 3'],
        }),
      ]),
    );
    expect(report.fallbackVenueAssignments).toEqual([]);
  });

  it('should report the complete catalog and assignment plan without writing during dry run', async () => {
    const store = new InMemoryLegacyLocationMigrationStore(buildLegacyState());

    const report = await runLegacyLocationMigration(store, true);
    const state = await store.readState();

    expect(report).toMatchObject({
      mode: 'dry-run',
      plannedLocalityNames: ['Barcelona'],
      plannedVenueNames: [
        'Palau Olímpic de Badalona',
        'Palau Sant Jordi',
        'Razzmatazz',
      ],
      fallbackVenueAssignments: [],
      canApply: true,
      before: {
        catalog: {
          requiredLocalityNames: ['Barcelona'],
          missingLocalityNames: ['Barcelona'],
          requiredVenueNames: [
            'Palau Olímpic de Badalona',
            'Palau Sant Jordi',
            'Razzmatazz',
          ],
        },
        gigs: {
          total: 3,
          missing: 3,
          valid: 0,
          venueBackfills: 3,
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
          missingLocalityNames: [],
          missingVenueNames: [],
        },
        gigs: { missing: 0, valid: 3 },
        gigCandidates: { missing: 0, valid: 2 },
        blockingReasons: [],
      },
      writes: {
        localities: { insertedCount: 0 },
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
    const store = new InMemoryLegacyLocationMigrationStore(buildLegacyState());

    const firstReport = await runLegacyLocationMigration(store, false);
    const appliedState = await store.readState();
    const rerunReport = await runLegacyLocationMigration(store, false);

    expect(firstReport.writes).toEqual({
      localities: { matchedCount: 0, modifiedCount: 0, insertedCount: 1 },
      venues: { matchedCount: 0, modifiedCount: 0, insertedCount: 3 },
      gigs: { matchedCount: 3, modifiedCount: 3, insertedCount: 0 },
      gigCandidates: {
        matchedCount: 2,
        modifiedCount: 2,
        insertedCount: 0,
      },
    });
    expect(appliedState.localities).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Barcelona' })]),
    );
    expect(appliedState.venues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Razzmatazz', isActive: true }),
        expect.objectContaining({ name: 'Palau Sant Jordi', isActive: true }),
        expect.objectContaining({
          name: 'Palau Olímpic de Badalona',
          isActive: true,
        }),
      ]),
    );
    expect(appliedState.gigs[0].venueIds).toEqual(
      appliedState.gigs[1].venueIds,
    );
    expect(appliedState.gigs[2].venueIds).not.toEqual(
      appliedState.gigs[0].venueIds,
    );
    expect(appliedState.gigCandidates[0]).toMatchObject({
      gigDraft: { venueIds: [expect.any(Types.ObjectId)] },
    });
    expect(appliedState.gigCandidates[1]).toMatchObject({
      localityId: expect.any(Types.ObjectId),
      gigDraft: {},
    });
    expect(rerunReport.writes).toEqual({
      localities: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      venues: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      gigs: { matchedCount: 0, modifiedCount: 0, insertedCount: 0 },
      gigCandidates: {
        matchedCount: 0,
        modifiedCount: 0,
        insertedCount: 0,
      },
    });
  });

  it('should assign an unknown legacy value to an inactive fallback Venue', async () => {
    const gigId = new Types.ObjectId();
    const store = new InMemoryLegacyLocationMigrationStore({
      localities: [],
      venues: [],
      gigs: [{ _id: gigId, venue: 'Staging-only test location' }],
      gigCandidates: [],
    });

    const report = await runLegacyLocationMigration(store, false);
    const state = await store.readState();

    expect(report.canApply).toBe(true);
    expect(report.fallbackVenueAssignments).toEqual([
      {
        source: 'gig',
        recordId: gigId.toHexString(),
        legacyVenue: 'Staging-only test location',
      },
    ]);
    expect(state.venues).toEqual([
      expect.objectContaining({
        name: 'Legacy venue — manual review required',
        isActive: false,
      }),
    ]);
    expect(state.gigs[0]).toMatchObject({
      venue: 'Staging-only test location',
      venueIds: [expect.any(Types.ObjectId)],
    });
  });

  it('should reuse an existing Locality and canonical Venue', async () => {
    const localityId = new Types.ObjectId();
    const venueId = new Types.ObjectId();
    const store = new InMemoryLegacyLocationMigrationStore({
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
          aliases: ['Razzmatazz 1', 'Sala Razzmatazz'],
          isActive: false,
        },
      ],
      gigs: [{ _id: new Types.ObjectId(), venue: 'razzmatazz' }],
      gigCandidates: [],
    });

    const report = await runLegacyLocationMigration(store, false);
    const state = await store.readState();

    expect(report.plannedLocalityNames).toEqual([]);
    expect(report.plannedVenueNames).toEqual([]);
    expect(report.writes.localities.insertedCount).toBe(0);
    expect(report.writes.venues.insertedCount).toBe(0);
    expect(state.gigs[0].venueIds).toEqual([venueId]);
  });

  it('should block an Approved GigCandidate without a legacy Venue', async () => {
    const store = new InMemoryLegacyLocationMigrationStore({
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
    const insertLocalitiesSpy = vi.spyOn(store, 'insertLocalities');

    const report = await runLegacyLocationMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.gigCandidates.blockingRecordIds).toHaveLength(1);
    expect(insertLocalitiesSpy).not.toHaveBeenCalled();
  });

  it('should block a Gig without a usable legacy Venue', async () => {
    const gigId = new Types.ObjectId();
    const store = new InMemoryLegacyLocationMigrationStore({
      localities: [],
      venues: [],
      gigs: [{ _id: gigId, venue: '   ' }],
      gigCandidates: [],
    });

    const report = await runLegacyLocationMigration(store, true);

    expect(report.canApply).toBe(false);
    expect(report.before.gigs.blockingRecordIds).toEqual([gigId.toHexString()]);
  });

  it('should block simultaneous GigCandidate Locality and Venue assignments', async () => {
    const localityId = new Types.ObjectId();
    const venueId = new Types.ObjectId();
    const gigCandidateId = new Types.ObjectId();
    const store = new InMemoryLegacyLocationMigrationStore({
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
          aliases: ['Razzmatazz 1', 'Sala Razzmatazz'],
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

    const report = await runLegacyLocationMigration(store, true);

    expect(report.canApply).toBe(false);
    expect(report.before.gigCandidates.blockingRecordIds).toEqual([
      gigCandidateId.toHexString(),
    ]);
  });
});
