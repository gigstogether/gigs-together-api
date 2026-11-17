import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';
import {
  isValidLocalityAliases,
  isValidLocalityName,
  isValidLocalityQualifier,
  isValidLocalityTimeZone,
} from '@modules/location/locality/locality.validators';
import {
  isValidVenueAliases,
  isValidVenueName,
  normalizeVenueName,
} from '@modules/location/venue/venue.validators';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const BARCELONA_COUNTRY_ISO = 'ES';
const BARCELONA_LOCALITY_NAME = 'Barcelona';
const BARCELONA_TIME_ZONE = 'Europe/Madrid';
const APPROVED_GIG_CANDIDATE_STATUS = 'Approved';

export interface BarcelonaLocalityMigrationDocument {
  _id: unknown;
  countryIso?: unknown;
  name?: unknown;
  qualifier?: unknown;
  aliases?: unknown;
  timeZone?: unknown;
}

export interface BarcelonaLocalityInsertDocument {
  _id: Types.ObjectId;
  countryIso: string;
  name: string;
  aliases: string[];
  timeZone: string;
}

export interface VenueMigrationDocument {
  _id: unknown;
  localityId?: unknown;
  name?: unknown;
  aliases?: unknown;
  isActive?: unknown;
}

export interface VenueInsertDocument {
  _id: Types.ObjectId;
  localityId: Types.ObjectId;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface GigLocationMigrationDocument {
  _id: unknown;
  venueIds?: unknown;
  venue?: unknown;
}

export interface GigCandidateLocationMigrationDocument {
  _id: unknown;
  status?: unknown;
  localityId?: unknown;
  gigDraft?: unknown;
}

export interface BarcelonaLocationMigrationState {
  localities: BarcelonaLocalityMigrationDocument[];
  venues: VenueMigrationDocument[];
  gigs: GigLocationMigrationDocument[];
  gigCandidates: GigCandidateLocationMigrationDocument[];
}

export interface BarcelonaLocationMigrationWriteResult {
  matchedCount: number;
  modifiedCount: number;
  insertedCount: number;
}

export interface GigVenueBackfill {
  id: Types.ObjectId;
  venueIds: Types.ObjectId[];
}

export type GigCandidateLocationBackfill =
  | {
      kind: 'venues';
      id: Types.ObjectId;
      venueIds: Types.ObjectId[];
    }
  | {
      kind: 'locality';
      id: Types.ObjectId;
      localityId: Types.ObjectId;
    };

export interface BarcelonaLocationMigrationStore {
  readState(): Promise<BarcelonaLocationMigrationState>;
  insertLocality(
    locality: BarcelonaLocalityInsertDocument,
  ): Promise<BarcelonaLocationMigrationWriteResult>;
  insertVenues(
    venues: VenueInsertDocument[],
  ): Promise<BarcelonaLocationMigrationWriteResult>;
  backfillGigs(
    backfills: GigVenueBackfill[],
  ): Promise<BarcelonaLocationMigrationWriteResult>;
  backfillGigCandidates(
    backfills: GigCandidateLocationBackfill[],
  ): Promise<BarcelonaLocationMigrationWriteResult>;
}

interface CatalogSnapshot {
  localityRecords: number;
  hasUsableLocality: boolean;
  venueRecords: number;
  requiredVenueNames: string[];
  missingVenueNames: string[];
}

interface AssignmentSnapshot {
  total: number;
  missing: number;
  valid: number;
  venueBackfills: number;
  localityBackfills: number;
  blockingRecordIds: string[];
}

export interface BarcelonaLocationMigrationSnapshot {
  catalog: CatalogSnapshot;
  gigs: AssignmentSnapshot;
  gigCandidates: AssignmentSnapshot;
  blockingReasons: string[];
}

export interface BarcelonaLocationMigrationWrites {
  locality: BarcelonaLocationMigrationWriteResult;
  venues: BarcelonaLocationMigrationWriteResult;
  gigs: BarcelonaLocationMigrationWriteResult;
  gigCandidates: BarcelonaLocationMigrationWriteResult;
}

export interface BarcelonaLocationMigrationReport {
  mode: 'dry-run' | 'apply';
  localityId: string;
  plannedVenueNames: string[];
  before: BarcelonaLocationMigrationSnapshot;
  projectedAfter: BarcelonaLocationMigrationSnapshot;
  writes: BarcelonaLocationMigrationWrites;
  after: BarcelonaLocationMigrationSnapshot;
  canApply: boolean;
  rollback: string;
}

interface VenueName {
  key: string;
  name: string;
}

interface LegacyVenueOwner {
  venue?: unknown;
}

interface UsableVenueMigrationDocument extends VenueMigrationDocument {
  _id: Types.ObjectId;
  localityId: Types.ObjectId;
  name: string;
  aliases: string[];
  isActive: boolean;
}

type LegacyVenueReadResult =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'valid'; venue: VenueName };

interface MigrationPlan {
  localityId: Types.ObjectId;
  localityToInsert?: BarcelonaLocalityInsertDocument;
  venuesToInsert: VenueInsertDocument[];
  gigBackfills: GigVenueBackfill[];
  gigCandidateBackfills: GigCandidateLocationBackfill[];
  snapshot: BarcelonaLocationMigrationSnapshot;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function toRecordId(value: unknown): string {
  if (value instanceof Types.ObjectId) {
    return value.toHexString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '[invalid-id]';
}

function toNameKey(value: string): string {
  return normalizeVenueName(value).normalize('NFKC').toLowerCase();
}

function compareNames(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function readLegacyVenue(owner: LegacyVenueOwner): LegacyVenueReadResult {
  if (!hasOwn(owner, 'venue') || owner.venue === undefined) {
    return { kind: 'missing' };
  }
  if (typeof owner.venue !== 'string') {
    return { kind: 'invalid' };
  }

  const name = normalizeVenueName(owner.venue);
  if (name.length === 0) {
    return { kind: 'missing' };
  }
  if (!isValidVenueName(name)) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'valid',
    venue: { key: toNameKey(name), name },
  };
}

function addRequiredVenueName(
  namesByKey: Map<string, string>,
  venue: VenueName,
): void {
  if (!namesByKey.has(venue.key)) {
    namesByKey.set(venue.key, venue.name);
  }
}

function collectRequiredVenueNames(
  state: BarcelonaLocationMigrationState,
): VenueName[] {
  const namesByKey = new Map<string, string>();

  for (const gig of state.gigs) {
    if (hasOwn(gig, 'venueIds')) {
      continue;
    }
    const legacyVenue = readLegacyVenue(gig);
    if (legacyVenue.kind === 'valid') {
      addRequiredVenueName(namesByKey, legacyVenue.venue);
    }
  }

  for (const gigCandidate of state.gigCandidates) {
    if (!isRecord(gigCandidate.gigDraft)) {
      continue;
    }
    if (
      hasOwn(gigCandidate, 'localityId') ||
      hasOwn(gigCandidate.gigDraft, 'venueIds')
    ) {
      continue;
    }
    const legacyVenue = readLegacyVenue(gigCandidate.gigDraft);
    if (legacyVenue.kind === 'valid') {
      addRequiredVenueName(namesByKey, legacyVenue.venue);
    }
  }

  return Array.from(namesByKey, ([key, name]) => ({ key, name })).sort(
    (left, right) => compareNames(left.name, right.name),
  );
}

function isUsableBarcelonaLocality(
  locality: BarcelonaLocalityMigrationDocument,
): boolean {
  return (
    locality._id instanceof Types.ObjectId &&
    locality.countryIso === BARCELONA_COUNTRY_ISO &&
    typeof locality.name === 'string' &&
    toNameKey(locality.name) === toNameKey(BARCELONA_LOCALITY_NAME) &&
    isValidLocalityName(locality.name) &&
    (locality.qualifier === undefined ||
      (typeof locality.qualifier === 'string' &&
        isValidLocalityQualifier(locality.qualifier))) &&
    Array.isArray(locality.aliases) &&
    locality.aliases.every((alias) => typeof alias === 'string') &&
    isValidLocalityAliases(locality.name, locality.aliases) &&
    locality.timeZone === BARCELONA_TIME_ZONE &&
    isValidLocalityTimeZone(locality.timeZone)
  );
}

function createBarcelonaLocality(
  localityId: Types.ObjectId,
): BarcelonaLocalityInsertDocument {
  return {
    _id: localityId,
    countryIso: BARCELONA_COUNTRY_ISO,
    name: BARCELONA_LOCALITY_NAME,
    aliases: [],
    timeZone: BARCELONA_TIME_ZONE,
  };
}

function isVenueInLocality(
  venue: VenueMigrationDocument,
  localityId: Types.ObjectId,
): boolean {
  return (
    venue.localityId instanceof Types.ObjectId &&
    venue.localityId.equals(localityId)
  );
}

function isUsableVenue(
  venue: VenueMigrationDocument,
  localityId: Types.ObjectId,
): venue is UsableVenueMigrationDocument {
  return (
    venue._id instanceof Types.ObjectId &&
    isVenueInLocality(venue, localityId) &&
    typeof venue.name === 'string' &&
    isValidVenueName(venue.name) &&
    Array.isArray(venue.aliases) &&
    venue.aliases.every((alias) => typeof alias === 'string') &&
    isValidVenueAliases(venue.name, venue.aliases) &&
    typeof venue.isActive === 'boolean'
  );
}

function readObjectIdArray(value: unknown): Types.ObjectId[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const ids: Types.ObjectId[] = [];
  const keys = new Set<string>();
  for (const item of value) {
    if (!(item instanceof Types.ObjectId)) {
      return null;
    }
    const key = item.toHexString();
    if (keys.has(key)) {
      return null;
    }
    keys.add(key);
    ids.push(item);
  }

  return ids;
}

function hasValidVenueAssignment(
  venueIds: Types.ObjectId[],
  venuesById: Map<string, VenueMigrationDocument>,
  localityId: Types.ObjectId,
): boolean {
  return venueIds.every((venueId) => {
    const venue = venuesById.get(venueId.toHexString());
    return venue !== undefined && isUsableVenue(venue, localityId);
  });
}

function createEmptyAssignmentSnapshot(total: number): AssignmentSnapshot {
  return {
    total,
    missing: 0,
    valid: 0,
    venueBackfills: 0,
    localityBackfills: 0,
    blockingRecordIds: [],
  };
}

function addBlockingRecord(snapshot: AssignmentSnapshot, id: unknown): void {
  snapshot.blockingRecordIds.push(toRecordId(id));
}

function buildMigrationPlan(
  state: BarcelonaLocationMigrationState,
): MigrationPlan {
  const blockingReasons: string[] = [];
  const locality = state.localities[0];
  const localityId =
    locality?._id instanceof Types.ObjectId
      ? locality._id
      : new Types.ObjectId();
  let localityToInsert: BarcelonaLocalityInsertDocument | undefined;

  if (state.localities.length === 0) {
    localityToInsert = createBarcelonaLocality(localityId);
  } else if (state.localities.length > 1) {
    blockingReasons.push('Multiple Barcelona Locality records exist.');
  } else if (locality === undefined || !isUsableBarcelonaLocality(locality)) {
    blockingReasons.push(
      'The existing Barcelona Locality is not usable by the migration.',
    );
  }

  const requiredVenueNames = collectRequiredVenueNames(state);
  const venuesByNameKey = new Map<string, Types.ObjectId>();
  const occupiedVenueNameKeys = new Set<string>();
  let venueRecords = 0;

  for (const venue of state.venues) {
    if (!isVenueInLocality(venue, localityId)) {
      continue;
    }
    venueRecords += 1;

    if (typeof venue.name !== 'string' || !isValidVenueName(venue.name)) {
      blockingReasons.push(
        `Venue ${toRecordId(venue._id)} in Barcelona has an invalid name.`,
      );
      continue;
    }

    const nameKey = toNameKey(venue.name);
    occupiedVenueNameKeys.add(nameKey);
    if (!isUsableVenue(venue, localityId)) {
      blockingReasons.push(
        `Venue ${toRecordId(venue._id)} in Barcelona is not usable by the migration.`,
      );
      continue;
    }
    if (venuesByNameKey.has(nameKey)) {
      blockingReasons.push(
        `Multiple Barcelona Venues share the name key "${nameKey}".`,
      );
      continue;
    }
    venuesByNameKey.set(nameKey, venue._id);
  }

  const venuesToInsert: VenueInsertDocument[] = [];
  for (const requiredVenue of requiredVenueNames) {
    if (venuesByNameKey.has(requiredVenue.key)) {
      continue;
    }
    if (occupiedVenueNameKeys.has(requiredVenue.key)) {
      continue;
    }

    const venue: VenueInsertDocument = {
      _id: new Types.ObjectId(),
      localityId,
      name: requiredVenue.name,
      aliases: [],
      isActive: true,
    };
    venuesToInsert.push(venue);
    venuesByNameKey.set(requiredVenue.key, venue._id);
  }

  const venuesById = new Map<string, VenueMigrationDocument>();
  for (const venue of [...state.venues, ...venuesToInsert]) {
    if (venue._id instanceof Types.ObjectId) {
      venuesById.set(venue._id.toHexString(), venue);
    }
  }

  const gigPlan = buildGigAssignmentPlan(
    state.gigs,
    localityId,
    venuesByNameKey,
    venuesById,
  );
  const gigCandidatePlan = buildGigCandidateAssignmentPlan(
    state.gigCandidates,
    localityId,
    venuesByNameKey,
    venuesById,
  );
  if (gigPlan.snapshot.blockingRecordIds.length > 0) {
    blockingReasons.push(
      'Some Gigs have invalid or conflicting Venue assignments.',
    );
  }
  if (gigCandidatePlan.snapshot.blockingRecordIds.length > 0) {
    blockingReasons.push(
      'Some GigCandidates have invalid or conflicting location assignments.',
    );
  }

  return {
    localityId,
    localityToInsert,
    venuesToInsert,
    gigBackfills: gigPlan.backfills,
    gigCandidateBackfills: gigCandidatePlan.backfills,
    snapshot: {
      catalog: {
        localityRecords: state.localities.length,
        hasUsableLocality:
          locality !== undefined && isUsableBarcelonaLocality(locality),
        venueRecords,
        requiredVenueNames: requiredVenueNames.map(({ name }) => name),
        missingVenueNames: venuesToInsert.map(({ name }) => name),
      },
      gigs: gigPlan.snapshot,
      gigCandidates: gigCandidatePlan.snapshot,
      blockingReasons,
    },
  };
}

interface EntityAssignmentPlan<T> {
  snapshot: AssignmentSnapshot;
  backfills: T[];
}

function buildGigAssignmentPlan(
  gigs: GigLocationMigrationDocument[],
  localityId: Types.ObjectId,
  venuesByNameKey: Map<string, Types.ObjectId>,
  venuesById: Map<string, VenueMigrationDocument>,
): EntityAssignmentPlan<GigVenueBackfill> {
  const snapshot = createEmptyAssignmentSnapshot(gigs.length);
  const backfills: GigVenueBackfill[] = [];

  for (const gig of gigs) {
    if (!(gig._id instanceof Types.ObjectId)) {
      addBlockingRecord(snapshot, gig._id);
      continue;
    }
    if (hasOwn(gig, 'venueIds')) {
      const venueIds = readObjectIdArray(gig.venueIds);
      if (
        venueIds !== null &&
        hasValidVenueAssignment(venueIds, venuesById, localityId)
      ) {
        snapshot.valid += 1;
      } else {
        addBlockingRecord(snapshot, gig._id);
      }
      continue;
    }

    const legacyVenue = readLegacyVenue(gig);
    const venueId =
      legacyVenue.kind === 'valid'
        ? venuesByNameKey.get(legacyVenue.venue.key)
        : undefined;
    if (venueId === undefined) {
      addBlockingRecord(snapshot, gig._id);
      continue;
    }

    backfills.push({ id: gig._id, venueIds: [venueId] });
    snapshot.missing += 1;
    snapshot.venueBackfills += 1;
  }

  snapshot.blockingRecordIds.sort();
  return { snapshot, backfills };
}

function buildGigCandidateAssignmentPlan(
  gigCandidates: GigCandidateLocationMigrationDocument[],
  localityId: Types.ObjectId,
  venuesByNameKey: Map<string, Types.ObjectId>,
  venuesById: Map<string, VenueMigrationDocument>,
): EntityAssignmentPlan<GigCandidateLocationBackfill> {
  const snapshot = createEmptyAssignmentSnapshot(gigCandidates.length);
  const backfills: GigCandidateLocationBackfill[] = [];

  for (const gigCandidate of gigCandidates) {
    if (
      !(gigCandidate._id instanceof Types.ObjectId) ||
      !isRecord(gigCandidate.gigDraft)
    ) {
      addBlockingRecord(snapshot, gigCandidate._id);
      continue;
    }

    const hasLocalityId = hasOwn(gigCandidate, 'localityId');
    const hasVenueIds = hasOwn(gigCandidate.gigDraft, 'venueIds');
    if (hasLocalityId && hasVenueIds) {
      addBlockingRecord(snapshot, gigCandidate._id);
      continue;
    }
    if (hasVenueIds) {
      const venueIds = readObjectIdArray(gigCandidate.gigDraft.venueIds);
      if (
        venueIds !== null &&
        hasValidVenueAssignment(venueIds, venuesById, localityId)
      ) {
        snapshot.valid += 1;
      } else {
        addBlockingRecord(snapshot, gigCandidate._id);
      }
      continue;
    }
    if (hasLocalityId) {
      if (
        gigCandidate.localityId instanceof Types.ObjectId &&
        gigCandidate.localityId.equals(localityId) &&
        gigCandidate.status !== APPROVED_GIG_CANDIDATE_STATUS
      ) {
        snapshot.valid += 1;
      } else {
        addBlockingRecord(snapshot, gigCandidate._id);
      }
      continue;
    }

    const legacyVenue = readLegacyVenue(gigCandidate.gigDraft);
    if (legacyVenue.kind === 'valid') {
      const venueId = venuesByNameKey.get(legacyVenue.venue.key);
      if (venueId === undefined) {
        addBlockingRecord(snapshot, gigCandidate._id);
        continue;
      }
      backfills.push({
        kind: 'venues',
        id: gigCandidate._id,
        venueIds: [venueId],
      });
      snapshot.missing += 1;
      snapshot.venueBackfills += 1;
      continue;
    }

    if (
      legacyVenue.kind === 'missing' &&
      gigCandidate.status !== APPROVED_GIG_CANDIDATE_STATUS
    ) {
      backfills.push({
        kind: 'locality',
        id: gigCandidate._id,
        localityId,
      });
      snapshot.missing += 1;
      snapshot.localityBackfills += 1;
      continue;
    }

    addBlockingRecord(snapshot, gigCandidate._id);
  }

  snapshot.blockingRecordIds.sort();
  return { snapshot, backfills };
}

function projectState(
  state: BarcelonaLocationMigrationState,
  plan: MigrationPlan,
): BarcelonaLocationMigrationState {
  const gigBackfillsById = new Map(
    plan.gigBackfills.map((backfill) => [backfill.id.toHexString(), backfill]),
  );
  const gigCandidateBackfillsById = new Map(
    plan.gigCandidateBackfills.map((backfill) => [
      backfill.id.toHexString(),
      backfill,
    ]),
  );

  return {
    localities:
      plan.localityToInsert === undefined
        ? state.localities.map((document) => ({ ...document }))
        : [
            ...state.localities.map((document) => ({ ...document })),
            { ...plan.localityToInsert },
          ],
    venues: [
      ...state.venues.map((document) => ({ ...document })),
      ...plan.venuesToInsert.map((document) => ({ ...document })),
    ],
    gigs: state.gigs.map((document) => {
      const backfill =
        document._id instanceof Types.ObjectId
          ? gigBackfillsById.get(document._id.toHexString())
          : undefined;
      return backfill === undefined
        ? { ...document }
        : { ...document, venueIds: [...backfill.venueIds] };
    }),
    gigCandidates: state.gigCandidates.map((document) => {
      const backfill =
        document._id instanceof Types.ObjectId
          ? gigCandidateBackfillsById.get(document._id.toHexString())
          : undefined;
      if (backfill === undefined) {
        return isRecord(document.gigDraft)
          ? { ...document, gigDraft: { ...document.gigDraft } }
          : { ...document };
      }
      if (backfill.kind === 'locality') {
        return { ...document, localityId: backfill.localityId };
      }
      if (!isRecord(document.gigDraft)) {
        return { ...document };
      }
      return {
        ...document,
        gigDraft: {
          ...document.gigDraft,
          venueIds: [...backfill.venueIds],
        },
      };
    }),
  };
}

function emptyWriteResult(): BarcelonaLocationMigrationWriteResult {
  return { matchedCount: 0, modifiedCount: 0, insertedCount: 0 };
}

function isSnapshotComplete(
  snapshot: BarcelonaLocationMigrationSnapshot,
): boolean {
  return (
    snapshot.blockingReasons.length === 0 &&
    snapshot.catalog.localityRecords === 1 &&
    snapshot.catalog.hasUsableLocality &&
    snapshot.catalog.missingVenueNames.length === 0 &&
    snapshot.gigs.missing === 0 &&
    snapshot.gigs.valid === snapshot.gigs.total &&
    snapshot.gigCandidates.missing === 0 &&
    snapshot.gigCandidates.valid === snapshot.gigCandidates.total
  );
}

export async function runBarcelonaLocationMigration(
  store: BarcelonaLocationMigrationStore,
  isDryRun: boolean,
): Promise<BarcelonaLocationMigrationReport> {
  const beforeState = await store.readState();
  const plan = buildMigrationPlan(beforeState);
  const projectedAfter = buildMigrationPlan(
    projectState(beforeState, plan),
  ).snapshot;
  const canApply =
    plan.snapshot.blockingReasons.length === 0 &&
    isSnapshotComplete(projectedAfter);
  const writes: BarcelonaLocationMigrationWrites = {
    locality: emptyWriteResult(),
    venues: emptyWriteResult(),
    gigs: emptyWriteResult(),
    gigCandidates: emptyWriteResult(),
  };

  if (!isDryRun && canApply) {
    if (plan.localityToInsert !== undefined) {
      writes.locality = await store.insertLocality(plan.localityToInsert);
    }
    if (plan.venuesToInsert.length > 0) {
      writes.venues = await store.insertVenues(plan.venuesToInsert);
    }
    if (plan.gigBackfills.length > 0) {
      writes.gigs = await store.backfillGigs(plan.gigBackfills);
    }
    if (plan.gigCandidateBackfills.length > 0) {
      writes.gigCandidates = await store.backfillGigCandidates(
        plan.gigCandidateBackfills,
      );
    }
  }

  const afterState = isDryRun ? beforeState : await store.readState();
  const after = buildMigrationPlan(afterState).snapshot;
  if (!isDryRun && canApply && !isSnapshotComplete(after)) {
    throw new Error(
      'Barcelona Locality and Venue migration post-apply invariants failed',
    );
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    localityId: plan.localityId.toHexString(),
    plannedVenueNames: plan.venuesToInsert.map(({ name }) => name),
    before: plan.snapshot,
    projectedAfter,
    writes,
    after,
    canApply,
    rollback:
      'One-way catalog bootstrap and relationship backfill. Restore from a verified backup before removing Locality or Venue assignments after application writes begin.',
  };
}

function createMongoStore(
  connection: Connection,
): BarcelonaLocationMigrationStore {
  const localities = connection.collection('localities');
  const venues = connection.collection('venues');
  const gigs = connection.collection('gigs');
  const gigCandidates = connection.collection('gigcandidates');

  return {
    async readState(): Promise<BarcelonaLocationMigrationState> {
      const [localityRows, venueRows, gigRows, gigCandidateRows] =
        await Promise.all([
          localities
            .find(
              {
                countryIso: BARCELONA_COUNTRY_ISO,
                name: BARCELONA_LOCALITY_NAME,
              },
              {
                projection: {
                  _id: 1,
                  countryIso: 1,
                  name: 1,
                  qualifier: 1,
                  aliases: 1,
                  timeZone: 1,
                },
              },
            )
            .collation({ locale: 'en', strength: 2 })
            .sort({ _id: 1 })
            .toArray(),
          venues
            .find(
              {},
              {
                projection: {
                  _id: 1,
                  localityId: 1,
                  name: 1,
                  aliases: 1,
                  isActive: 1,
                },
              },
            )
            .sort({ _id: 1 })
            .toArray(),
          gigs
            .find({}, { projection: { _id: 1, venueIds: 1, venue: 1 } })
            .sort({ _id: 1 })
            .toArray(),
          gigCandidates
            .find(
              {},
              {
                projection: {
                  _id: 1,
                  status: 1,
                  localityId: 1,
                  gigDraft: 1,
                },
              },
            )
            .sort({ _id: 1 })
            .toArray(),
        ]);

      return {
        localities: localityRows,
        venues: venueRows,
        gigs: gigRows,
        gigCandidates: gigCandidateRows,
      };
    },
    async insertLocality(locality) {
      await localities.insertOne(locality);
      return { matchedCount: 0, modifiedCount: 0, insertedCount: 1 };
    },
    async insertVenues(venueDocuments) {
      const result = await venues.insertMany(venueDocuments);
      return {
        matchedCount: 0,
        modifiedCount: 0,
        insertedCount: result.insertedCount,
      };
    },
    async backfillGigs(backfills) {
      const result = await gigs.bulkWrite(
        backfills.map((backfill) => ({
          updateOne: {
            filter: {
              _id: backfill.id,
              venueIds: { $exists: false },
            },
            update: { $set: { venueIds: backfill.venueIds } },
          },
        })),
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        insertedCount: 0,
      };
    },
    async backfillGigCandidates(backfills) {
      const venueBackfills = backfills.filter(
        (backfill) => backfill.kind === 'venues',
      );
      const localityBackfills = backfills.filter(
        (backfill) => backfill.kind === 'locality',
      );
      let matchedCount = 0;
      let modifiedCount = 0;

      if (venueBackfills.length > 0) {
        const result = await gigCandidates.bulkWrite(
          venueBackfills.map((backfill) => ({
            updateOne: {
              filter: {
                _id: backfill.id,
                localityId: { $exists: false },
                'gigDraft.venueIds': { $exists: false },
              },
              update: {
                $set: { 'gigDraft.venueIds': backfill.venueIds },
              },
            },
          })),
        );
        matchedCount += result.matchedCount;
        modifiedCount += result.modifiedCount;
      }

      if (localityBackfills.length > 0) {
        const result = await gigCandidates.bulkWrite(
          localityBackfills.map((backfill) => ({
            updateOne: {
              filter: {
                _id: backfill.id,
                localityId: { $exists: false },
                'gigDraft.venueIds': { $exists: false },
              },
              update: { $set: { localityId: backfill.localityId } },
            },
          })),
        );
        matchedCount += result.matchedCount;
        modifiedCount += result.modifiedCount;
      }

      return { matchedCount, modifiedCount, insertedCount: 0 };
    },
  };
}

export async function up(connection: Connection): Promise<void> {
  const isDryRun = isMigrationDryRun();
  const report = await runBarcelonaLocationMigration(
    createMongoStore(connection),
    isDryRun,
  );

  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Barcelona Locality and Venue migration blocked: ${[
        ...report.before.blockingReasons,
        ...report.projectedAfter.blockingReasons,
      ].join(' ')}`,
    );
  }

  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'This migration is intentionally one-way; removing Locality or Venue assignments after application writes begin is unsafe.',
    ),
  );
}
