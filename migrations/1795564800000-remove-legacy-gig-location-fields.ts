import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const APPROVED_GIG_CANDIDATE_STATUS = 'Approved';
const LEGACY_TRANSLATION_NAMESPACES = ['city', 'country'];

export interface LegacyLocationCleanupVenueDocument {
  _id: unknown;
  localityId?: unknown;
}

export interface LegacyLocationCleanupLocalityDocument {
  _id: unknown;
}

export interface LegacyLocationCleanupGigDocument {
  _id: unknown;
  venueIds?: unknown;
  city?: unknown;
  country?: unknown;
  venue?: unknown;
}

export interface LegacyLocationCleanupGigCandidateDocument {
  _id: unknown;
  status?: unknown;
  localityId?: unknown;
  gigDraft?: unknown;
}

export interface LegacyLocationCleanupTranslationDocument {
  _id: unknown;
  namespace?: unknown;
}

export interface LegacyLocationCleanupState {
  localities: LegacyLocationCleanupLocalityDocument[];
  venues: LegacyLocationCleanupVenueDocument[];
  gigs: LegacyLocationCleanupGigDocument[];
  gigCandidates: LegacyLocationCleanupGigCandidateDocument[];
  translations: LegacyLocationCleanupTranslationDocument[];
}

export interface LegacyLocationCleanupWriteResult {
  matchedCount: number;
  modifiedCount: number;
}

export interface LegacyTranslationCleanupWriteResult {
  deletedCount: number;
}

export interface LegacyLocationCleanupStore {
  readState(): Promise<LegacyLocationCleanupState>;
  removeLegacyGigLocationFields(): Promise<LegacyLocationCleanupWriteResult>;
  removeLegacyGigCandidateLocationFields(): Promise<LegacyLocationCleanupWriteResult>;
  removeLegacyLocationTranslations(): Promise<LegacyTranslationCleanupWriteResult>;
}

interface LegacyFieldCounts {
  city: number;
  country: number;
  venue: number;
}

interface GigCleanupSnapshot {
  total: number;
  valid: number;
  legacyFields: LegacyFieldCounts;
  blockingRecordIds: string[];
}

interface GigCandidateCleanupSnapshot {
  total: number;
  valid: number;
  approved: number;
  legacyFields: LegacyFieldCounts;
  blockingRecordIds: string[];
}

interface TranslationCleanupSnapshot {
  city: number;
  country: number;
}

export interface LegacyLocationCleanupSnapshot {
  gigs: GigCleanupSnapshot;
  gigCandidates: GigCandidateCleanupSnapshot;
  translations: TranslationCleanupSnapshot;
  blockingReasons: string[];
}

export interface LegacyLocationCleanupWrites {
  gigs: LegacyLocationCleanupWriteResult;
  gigCandidates: LegacyLocationCleanupWriteResult;
  translations: LegacyTranslationCleanupWriteResult;
}

export interface LegacyLocationCleanupReport {
  mode: 'dry-run' | 'apply';
  before: LegacyLocationCleanupSnapshot;
  projectedAfter: LegacyLocationCleanupSnapshot;
  writes: LegacyLocationCleanupWrites;
  after: LegacyLocationCleanupSnapshot;
  canApply: boolean;
  rollback: string;
}

interface VenueCatalogItem {
  localityId: string;
}

interface VenueCatalog {
  localityIds: Set<string>;
  venuesById: Map<string, VenueCatalogItem>;
}

interface VenueSelectionValidation {
  isValid: boolean;
  reason?: string;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function getRecordId(value: unknown): string {
  if (value instanceof Types.ObjectId) {
    return value.toHexString();
  }
  return String(value);
}

function getObjectId(value: unknown): string | undefined {
  if (!(value instanceof Types.ObjectId)) {
    return undefined;
  }
  return value.toHexString();
}

function buildVenueCatalog(state: LegacyLocationCleanupState): VenueCatalog {
  const localityIds = new Set<string>();
  for (const locality of state.localities) {
    const localityId = getObjectId(locality._id);
    if (localityId !== undefined) {
      localityIds.add(localityId);
    }
  }

  const venuesById = new Map<string, VenueCatalogItem>();
  for (const venue of state.venues) {
    const venueId = getObjectId(venue._id);
    const localityId = getObjectId(venue.localityId);
    if (venueId !== undefined && localityId !== undefined) {
      venuesById.set(venueId, { localityId });
    }
  }

  return { localityIds, venuesById };
}

function validateVenueSelection(
  value: unknown,
  catalog: VenueCatalog,
): VenueSelectionValidation {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      isValid: false,
      reason: 'Venue assignment must contain at least one Venue ObjectId.',
    };
  }

  const venueIds: string[] = [];
  for (const venueIdValue of value) {
    const venueId = getObjectId(venueIdValue);
    if (venueId === undefined) {
      return {
        isValid: false,
        reason: 'Venue assignment contains a value that is not an ObjectId.',
      };
    }
    venueIds.push(venueId);
  }

  if (new Set(venueIds).size !== venueIds.length) {
    return {
      isValid: false,
      reason: 'Venue assignment contains duplicate Venue IDs.',
    };
  }

  const venueLocalityIds = new Set<string>();
  for (const venueId of venueIds) {
    const venue = catalog.venuesById.get(venueId);
    if (venue === undefined) {
      return {
        isValid: false,
        reason: `Venue ${venueId} does not exist or has an invalid Locality reference.`,
      };
    }
    if (!catalog.localityIds.has(venue.localityId)) {
      return {
        isValid: false,
        reason: `Venue ${venueId} refers to a missing Locality.`,
      };
    }
    venueLocalityIds.add(venue.localityId);
  }

  if (venueLocalityIds.size !== 1) {
    return {
      isValid: false,
      reason: 'All Venues in one assignment must belong to the same Locality.',
    };
  }

  return { isValid: true };
}

function countLegacyFields(documents: object[]): LegacyFieldCounts {
  const counts: LegacyFieldCounts = { city: 0, country: 0, venue: 0 };
  for (const document of documents) {
    if (hasOwn(document, 'city')) {
      counts.city += 1;
    }
    if (hasOwn(document, 'country')) {
      counts.country += 1;
    }
    if (hasOwn(document, 'venue')) {
      counts.venue += 1;
    }
  }
  return counts;
}

function addBlockingReason(
  blockingReasons: string[],
  entity: 'Gig' | 'GigCandidate',
  recordId: string,
  reason: string,
): void {
  blockingReasons.push(`${entity} ${recordId}: ${reason}`);
}

function buildGigSnapshot(
  gigs: LegacyLocationCleanupGigDocument[],
  catalog: VenueCatalog,
  blockingReasons: string[],
): GigCleanupSnapshot {
  const blockingRecordIds: string[] = [];

  for (const gig of gigs) {
    const recordId = getRecordId(gig._id);
    const validation = validateVenueSelection(gig.venueIds, catalog);
    if (!validation.isValid) {
      blockingRecordIds.push(recordId);
      addBlockingReason(
        blockingReasons,
        'Gig',
        recordId,
        validation.reason ?? 'Venue assignment is invalid.',
      );
    }
  }

  return {
    total: gigs.length,
    valid: gigs.length - blockingRecordIds.length,
    legacyFields: countLegacyFields(gigs),
    blockingRecordIds,
  };
}

function buildGigCandidateSnapshot(
  gigCandidates: LegacyLocationCleanupGigCandidateDocument[],
  catalog: VenueCatalog,
  blockingReasons: string[],
): GigCandidateCleanupSnapshot {
  const blockingRecordIds: string[] = [];
  let approved = 0;

  for (const gigCandidate of gigCandidates) {
    const recordId = getRecordId(gigCandidate._id);
    const recordReasons: string[] = [];
    const isApproved = gigCandidate.status === APPROVED_GIG_CANDIDATE_STATUS;
    if (isApproved) {
      approved += 1;
    }

    if (!isRecord(gigCandidate.gigDraft)) {
      recordReasons.push('gigDraft must be an object.');
    } else {
      const hasLocality = hasOwn(gigCandidate, 'localityId');
      const hasVenues = hasOwn(gigCandidate.gigDraft, 'venueIds');

      if (hasLocality) {
        const localityId = getObjectId(gigCandidate.localityId);
        if (localityId === undefined || !catalog.localityIds.has(localityId)) {
          recordReasons.push('localityId must refer to an existing Locality.');
        }
      }

      if (hasVenues) {
        const validation = validateVenueSelection(
          gigCandidate.gigDraft.venueIds,
          catalog,
        );
        if (!validation.isValid) {
          recordReasons.push(
            validation.reason ?? 'Venue assignment is invalid.',
          );
        }
      }

      if (hasLocality && hasVenues) {
        recordReasons.push(
          'localityId and gigDraft.venueIds must not coexist.',
        );
      }
      if (isApproved && !hasVenues) {
        recordReasons.push(
          'Approved GigCandidate must have a Venue assignment.',
        );
      }
    }

    if (recordReasons.length > 0) {
      blockingRecordIds.push(recordId);
      for (const reason of recordReasons) {
        addBlockingReason(blockingReasons, 'GigCandidate', recordId, reason);
      }
    }
  }

  const gigDrafts = gigCandidates
    .map(({ gigDraft }) => gigDraft)
    .filter(isRecord);

  return {
    total: gigCandidates.length,
    valid: gigCandidates.length - blockingRecordIds.length,
    approved,
    legacyFields: countLegacyFields(gigDrafts),
    blockingRecordIds,
  };
}

function buildTranslationSnapshot(
  translations: LegacyLocationCleanupTranslationDocument[],
): TranslationCleanupSnapshot {
  let city = 0;
  let country = 0;
  for (const translation of translations) {
    if (translation.namespace === 'city') {
      city += 1;
    }
    if (translation.namespace === 'country') {
      country += 1;
    }
  }
  return { city, country };
}

function buildSnapshot(
  state: LegacyLocationCleanupState,
): LegacyLocationCleanupSnapshot {
  const blockingReasons: string[] = [];
  const catalog = buildVenueCatalog(state);

  return {
    gigs: buildGigSnapshot(state.gigs, catalog, blockingReasons),
    gigCandidates: buildGigCandidateSnapshot(
      state.gigCandidates,
      catalog,
      blockingReasons,
    ),
    translations: buildTranslationSnapshot(state.translations),
    blockingReasons,
  };
}

function projectCleanupState(
  state: LegacyLocationCleanupState,
): LegacyLocationCleanupState {
  return {
    localities: state.localities,
    venues: state.venues,
    gigs: state.gigs.map(({ _id, venueIds }) => ({ _id, venueIds })),
    gigCandidates: state.gigCandidates.map((gigCandidate) => {
      const projected: LegacyLocationCleanupGigCandidateDocument = {
        _id: gigCandidate._id,
        status: gigCandidate.status,
        localityId: gigCandidate.localityId,
      };
      if (!hasOwn(gigCandidate, 'localityId')) {
        delete projected.localityId;
      }
      if (isRecord(gigCandidate.gigDraft)) {
        const {
          city: _city,
          country: _country,
          venue: _venue,
          ...gigDraft
        } = gigCandidate.gigDraft;
        projected.gigDraft = gigDraft;
      } else {
        projected.gigDraft = gigCandidate.gigDraft;
      }
      return projected;
    }),
    translations: state.translations.filter(
      ({ namespace }) =>
        typeof namespace !== 'string' ||
        !LEGACY_TRANSLATION_NAMESPACES.includes(namespace),
    ),
  };
}

function isCleanupComplete(snapshot: LegacyLocationCleanupSnapshot): boolean {
  const gigLegacyFields = snapshot.gigs.legacyFields;
  const gigCandidateLegacyFields = snapshot.gigCandidates.legacyFields;

  return (
    snapshot.blockingReasons.length === 0 &&
    gigLegacyFields.city === 0 &&
    gigLegacyFields.country === 0 &&
    gigLegacyFields.venue === 0 &&
    gigCandidateLegacyFields.city === 0 &&
    gigCandidateLegacyFields.country === 0 &&
    gigCandidateLegacyFields.venue === 0 &&
    snapshot.translations.city === 0 &&
    snapshot.translations.country === 0
  );
}

function emptyWrites(): LegacyLocationCleanupWrites {
  return {
    gigs: { matchedCount: 0, modifiedCount: 0 },
    gigCandidates: { matchedCount: 0, modifiedCount: 0 },
    translations: { deletedCount: 0 },
  };
}

export async function runLegacyLocationCleanup(
  store: LegacyLocationCleanupStore,
  isDryRun: boolean,
): Promise<LegacyLocationCleanupReport> {
  const beforeState = await store.readState();
  const before = buildSnapshot(beforeState);
  const projectedAfter = buildSnapshot(projectCleanupState(beforeState));
  const canApply =
    before.blockingReasons.length === 0 && isCleanupComplete(projectedAfter);
  const writes = emptyWrites();

  if (!isDryRun && canApply) {
    writes.gigs = await store.removeLegacyGigLocationFields();
    writes.gigCandidates = await store.removeLegacyGigCandidateLocationFields();
    writes.translations = await store.removeLegacyLocationTranslations();
  }

  const afterState = isDryRun ? beforeState : await store.readState();
  const after = buildSnapshot(afterState);
  if (!isDryRun && canApply && !isCleanupComplete(after)) {
    throw new Error('Legacy location cleanup post-apply invariants failed');
  }

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    before,
    projectedAfter,
    writes,
    after,
    canApply,
    rollback:
      'One-way cleanup. Restore from a verified mongodump to recover removed legacy location fields or translations.',
  };
}

function createMongoStore(connection: Connection): LegacyLocationCleanupStore {
  const localities = connection.collection('localities');
  const venues = connection.collection('venues');
  const gigs = connection.collection('gigs');
  const gigCandidates = connection.collection('gigcandidates');
  const translations = connection.collection('translations');

  return {
    async readState(): Promise<LegacyLocationCleanupState> {
      const [
        localityRows,
        venueRows,
        gigRows,
        gigCandidateRows,
        translationRows,
      ] = await Promise.all([
        localities
          .find({}, { projection: { _id: 1 } })
          .sort({ _id: 1 })
          .toArray(),
        venues
          .find({}, { projection: { _id: 1, localityId: 1 } })
          .sort({ _id: 1 })
          .toArray(),
        gigs
          .find(
            {},
            {
              projection: {
                _id: 1,
                venueIds: 1,
                city: 1,
                country: 1,
                venue: 1,
              },
            },
          )
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
        translations
          .find(
            { namespace: { $in: LEGACY_TRANSLATION_NAMESPACES } },
            { projection: { _id: 1, namespace: 1 } },
          )
          .sort({ _id: 1 })
          .toArray(),
      ]);

      return {
        localities: localityRows,
        venues: venueRows,
        gigs: gigRows,
        gigCandidates: gigCandidateRows,
        translations: translationRows,
      };
    },
    async removeLegacyGigLocationFields() {
      const result = await gigs.updateMany(
        {
          $or: [
            { city: { $exists: true } },
            { country: { $exists: true } },
            { venue: { $exists: true } },
          ],
        },
        { $unset: { city: '', country: '', venue: '' } },
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    },
    async removeLegacyGigCandidateLocationFields() {
      const result = await gigCandidates.updateMany(
        {
          $or: [
            { 'gigDraft.city': { $exists: true } },
            { 'gigDraft.country': { $exists: true } },
            { 'gigDraft.venue': { $exists: true } },
          ],
        },
        {
          $unset: {
            'gigDraft.city': '',
            'gigDraft.country': '',
            'gigDraft.venue': '',
          },
        },
      );
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    },
    async removeLegacyLocationTranslations() {
      const result = await translations.deleteMany({
        namespace: { $in: LEGACY_TRANSLATION_NAMESPACES },
      });
      return { deletedCount: result.deletedCount };
    },
  };
}

export async function up(connection: Connection): Promise<void> {
  const isDryRun = isMigrationDryRun();
  const report = await runLegacyLocationCleanup(
    createMongoStore(connection),
    isDryRun,
  );

  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Legacy location cleanup blocked: ${report.before.blockingReasons.join(' ')}`,
    );
  }

  finishMigrationDryRun(isDryRun);
}

export function down(_connection: Connection): Promise<void> {
  return Promise.reject(
    new Error(
      'This migration is intentionally one-way; restore from a verified mongodump to recover removed legacy location fields or translations.',
    ),
  );
}
