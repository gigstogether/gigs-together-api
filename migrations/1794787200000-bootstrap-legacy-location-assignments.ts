import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
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
import { toGeographicSearchKey } from '@modules/location/geographic-name.validators';
import { isRecord } from '@shared/utils/is-record';

import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

const COUNTRY_ISO_ES = 'ES';
const TIME_ZONE_EUROPE_MADRID = 'Europe/Madrid';
const APPROVED_GIG_CANDIDATE_STATUS = 'Approved';
const BARCELONA_LOCALITY_KEY = 'barcelona';
const FALLBACK_VENUE_KEY = 'legacyVenueManualReview';

type LocalityKey = 'barcelona' | 'benicassim';

interface LocalityDefinition {
  key: LocalityKey;
  countryIso: string;
  name: string;
  aliases: string[];
  timeZone: string;
}

interface VenueDefinition {
  key: string;
  localityKey: LocalityKey;
  name: string;
  aliases: string[];
  legacyNames: string[];
  isActive: boolean;
}

const LOCALITY_DEFINITIONS: LocalityDefinition[] = [
  {
    key: BARCELONA_LOCALITY_KEY,
    countryIso: COUNTRY_ISO_ES,
    name: 'Barcelona',
    aliases: [],
    timeZone: TIME_ZONE_EUROPE_MADRID,
  },
  {
    key: 'benicassim',
    countryIso: COUNTRY_ISO_ES,
    name: 'Benicàssim',
    aliases: [],
    timeZone: TIME_ZONE_EUROPE_MADRID,
  },
];

const VENUE_DEFINITIONS: VenueDefinition[] = [
  {
    key: 'salaApolo',
    localityKey: 'barcelona',
    name: 'Sala Apolo',
    aliases: ['Apolo'],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'laDosDeApolo',
    localityKey: 'barcelona',
    name: 'La (2) de Apolo',
    aliases: ['Apolo 2', 'La 2 de Apolo'],
    legacyNames: ['La 2 de Apollo', 'La(2)'],
    isActive: true,
  },
  {
    key: 'auditoriForumCcib',
    localityKey: 'barcelona',
    name: 'Auditori Fòrum CCIB',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'barCeferino',
    localityKey: 'barcelona',
    name: 'Bar Ceferino',
    aliases: [],
    legacyNames: ['Bar Ceferino, Barcelona'],
    isActive: true,
  },
  {
    key: 'recintoFestivalesBenicassim',
    localityKey: 'benicassim',
    name: 'Recinto de Festivales de Benicàssim',
    aliases: [],
    legacyNames: ['Benicássim'],
    isActive: true,
  },
  {
    key: 'boveda',
    localityKey: 'barcelona',
    name: 'Bóveda',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'casaMontjuic',
    localityKey: 'barcelona',
    name: 'Casa Montjuïc',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'estadiOlimpicLluisCompanys',
    localityKey: 'barcelona',
    name: 'Estadi Olímpic Lluís Companys',
    aliases: ['Lluís Companys Olympic Stadium'],
    legacyNames: ['ESTADI OLÍMPIC LLUIS'],
    isActive: true,
  },
  {
    key: 'dosRombos',
    localityKey: 'barcelona',
    name: 'DosRombos',
    aliases: ['Estraperlo Club', 'Estraperlo Club del Ritme'],
    legacyNames: ['Estraperlo Club, Badalona'],
    isActive: true,
  },
  {
    key: 'heliogabal',
    localityKey: 'barcelona',
    name: 'Heliogàbal',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'jamboreeSalaOne',
    localityKey: 'barcelona',
    name: 'Jamboree Sala 1',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'kuBarcelona',
    localityKey: 'barcelona',
    name: 'Ku Barcelona',
    aliases: ['Ku', 'Pacha Barcelona'],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'kvartirnik',
    localityKey: 'barcelona',
    name: 'Kvartirnik',
    aliases: [],
    legacyNames: ['Kvartirnik, Carrer de Villarroel 79'],
    isActive: true,
  },
  {
    key: 'laCarpaPobleEspanyol',
    localityKey: 'barcelona',
    name: 'La Carpa (Poble Espanyol)',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'laNau',
    localityKey: 'barcelona',
    name: 'La Nau',
    aliases: ['Sala La Nau'],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'laut',
    localityKey: 'barcelona',
    name: 'LAUT',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'meteoro',
    localityKey: 'barcelona',
    name: 'Meteoro',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'mollDeBarcelona',
    localityKey: 'barcelona',
    name: 'Moll de Barcelona',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'palauOlimpicBadalona',
    localityKey: 'barcelona',
    name: 'Palau Olímpic de Badalona',
    aliases: [
      'Olimpic Arena',
      'Olimpic Arena Badalona',
      'Palau Olímpic Badalona',
    ],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'opiumBarcelona',
    localityKey: 'barcelona',
    name: 'Opium Barcelona',
    aliases: ['Opium'],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'palauSantJordi',
    localityKey: 'barcelona',
    name: 'Palau Sant Jordi',
    aliases: ['Sant Jordi'],
    legacyNames: ['Palau San Jordi'],
    isActive: true,
  },
  {
    key: 'parallelSixtyTwo',
    localityKey: 'barcelona',
    name: 'Paral·lel 62',
    aliases: ['Sala Paral·lel 62'],
    legacyNames: ['Paral-lel 62', 'Parallel 62'],
    isActive: true,
  },
  {
    key: 'parcCanZam',
    localityKey: 'barcelona',
    name: 'Parc de Can Zam',
    aliases: [],
    legacyNames: ['Parc de Can Zam (Santa Coloma de Gramenet)'],
    isActive: true,
  },
  {
    key: 'parcTrinitat',
    localityKey: 'barcelona',
    name: 'Parc de la Trinitat',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'parcForum',
    localityKey: 'barcelona',
    name: 'Parc del Fòrum',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'pobleEspanyol',
    localityKey: 'barcelona',
    name: 'Poble Espanyol',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'razzmatazzOne',
    localityKey: 'barcelona',
    name: 'Razzmatazz 1',
    aliases: ['Razzmatazz'],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'razzmatazzTwo',
    localityKey: 'barcelona',
    name: 'Razzmatazz 2',
    aliases: ['Sala Razzmatazz 2'],
    legacyNames: ['Razzmatazz 2, Barcelona'],
    isActive: true,
  },
  {
    key: 'razzmatazzThree',
    localityKey: 'barcelona',
    name: 'Razzmatazz 3',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'rougeCocktailClub',
    localityKey: 'barcelona',
    name: 'Rouge Cocktail Club',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'salaBikini',
    localityKey: 'barcelona',
    name: 'Sala Bikini',
    aliases: [],
    legacyNames: ['Sala Bikini Barcelona'],
    isActive: true,
  },
  {
    key: 'salaSidecar',
    localityKey: 'barcelona',
    name: 'Sala Sidecar',
    aliases: ['Club Sauvage'],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'salaUpload',
    localityKey: 'barcelona',
    name: 'Sala Upload',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'wolf',
    localityKey: 'barcelona',
    name: 'WOLF',
    aliases: ['Sala Wolf'],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'salamandra',
    localityKey: 'barcelona',
    name: 'Salamandra',
    aliases: ['Salamandra - Sala 1'],
    legacyNames: ['Salamandra (L’Hospitalet de Llobregat)'],
    isActive: true,
  },
  {
    key: 'santJordiClub',
    localityKey: 'barcelona',
    name: 'Sant Jordi Club',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
  {
    key: 'jardinsPalauPedralbes',
    localityKey: 'barcelona',
    name: 'Jardins del Palau de Pedralbes',
    aliases: [],
    legacyNames: [],
    isActive: true,
  },
];

const FALLBACK_VENUE_DEFINITION: VenueDefinition = {
  key: FALLBACK_VENUE_KEY,
  localityKey: BARCELONA_LOCALITY_KEY,
  name: 'Legacy venue — manual review required',
  aliases: [],
  legacyNames: [],
  isActive: false,
};

export interface LocalityMigrationDocument {
  _id: unknown;
  countryIso?: unknown;
  name?: unknown;
  qualifier?: unknown;
  aliases?: unknown;
  timeZone?: unknown;
}

export interface LocalityInsertDocument {
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

export interface LegacyLocationMigrationState {
  localities: LocalityMigrationDocument[];
  venues: VenueMigrationDocument[];
  gigs: GigLocationMigrationDocument[];
  gigCandidates: GigCandidateLocationMigrationDocument[];
}

export interface LocationMigrationWriteResult {
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

export interface LegacyLocationMigrationStore {
  readState(): Promise<LegacyLocationMigrationState>;
  insertLocalities(
    localities: LocalityInsertDocument[],
  ): Promise<LocationMigrationWriteResult>;
  insertVenues(
    venues: VenueInsertDocument[],
  ): Promise<LocationMigrationWriteResult>;
  backfillGigs(
    backfills: GigVenueBackfill[],
  ): Promise<LocationMigrationWriteResult>;
  backfillGigCandidates(
    backfills: GigCandidateLocationBackfill[],
  ): Promise<LocationMigrationWriteResult>;
}

export interface FallbackVenueAssignment {
  source: 'gig' | 'gigCandidate';
  recordId: string;
  legacyVenue: string;
}

interface CatalogSnapshot {
  requiredLocalityNames: string[];
  missingLocalityNames: string[];
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

export interface LegacyLocationMigrationSnapshot {
  catalog: CatalogSnapshot;
  gigs: AssignmentSnapshot;
  gigCandidates: AssignmentSnapshot;
  blockingReasons: string[];
}

export interface LegacyLocationMigrationWrites {
  localities: LocationMigrationWriteResult;
  venues: LocationMigrationWriteResult;
  gigs: LocationMigrationWriteResult;
  gigCandidates: LocationMigrationWriteResult;
}

interface LocalityReportItem {
  id: string;
  name: string;
}

export interface LegacyLocationMigrationReport {
  mode: 'dry-run' | 'apply';
  localities: LocalityReportItem[];
  plannedLocalityNames: string[];
  plannedVenueNames: string[];
  fallbackVenueAssignments: FallbackVenueAssignment[];
  before: LegacyLocationMigrationSnapshot;
  projectedAfter: LegacyLocationMigrationSnapshot;
  writes: LegacyLocationMigrationWrites;
  after: LegacyLocationMigrationSnapshot;
  canApply: boolean;
  rollback: string;
}

interface LegacyVenue {
  key: string;
  name: string;
}

interface LegacyVenueOwner {
  venue?: unknown;
}

interface UsableLocalityMigrationDocument extends LocalityMigrationDocument {
  _id: Types.ObjectId;
  countryIso: string;
  name: string;
  aliases: string[];
  timeZone: string;
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
  | { kind: 'valid'; venue: LegacyVenue };

interface MigrationPlan {
  localityIdsByKey: Map<LocalityKey, Types.ObjectId>;
  localitiesToInsert: LocalityInsertDocument[];
  venuesToInsert: VenueInsertDocument[];
  gigBackfills: GigVenueBackfill[];
  gigCandidateBackfills: GigCandidateLocationBackfill[];
  fallbackVenueAssignments: FallbackVenueAssignment[];
  snapshot: LegacyLocationMigrationSnapshot;
}

interface EntityAssignmentPlan<T> {
  snapshot: AssignmentSnapshot;
  backfills: T[];
  fallbackVenueAssignments: FallbackVenueAssignment[];
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
  return toGeographicSearchKey(value);
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right, 'en');
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

  return { kind: 'valid', venue: { key: toNameKey(name), name } };
}

function buildVenueDefinitionsByLegacyName(): Map<string, VenueDefinition> {
  const definitionsByName = new Map<string, VenueDefinition>();

  for (const definition of VENUE_DEFINITIONS) {
    for (const name of [
      definition.name,
      ...definition.aliases,
      ...definition.legacyNames,
    ]) {
      const key = toNameKey(name);
      const existingDefinition = definitionsByName.get(key);
      if (
        existingDefinition !== undefined &&
        existingDefinition.key !== definition.key
      ) {
        throw new Error(`Duplicate legacy Venue mapping for "${name}".`);
      }
      definitionsByName.set(key, definition);
    }
  }

  return definitionsByName;
}

const VENUE_DEFINITIONS_BY_LEGACY_NAME = buildVenueDefinitionsByLegacyName();

function getVenueDefinition(legacyVenue: LegacyVenue): VenueDefinition {
  return (
    VENUE_DEFINITIONS_BY_LEGACY_NAME.get(legacyVenue.key) ??
    FALLBACK_VENUE_DEFINITION
  );
}

function collectRequiredVenueDefinitions(
  state: LegacyLocationMigrationState,
): VenueDefinition[] {
  const definitionsByKey = new Map<string, VenueDefinition>();

  const addOwner = (owner: LegacyVenueOwner): void => {
    const legacyVenue = readLegacyVenue(owner);
    if (legacyVenue.kind !== 'valid') {
      return;
    }
    const definition = getVenueDefinition(legacyVenue.venue);
    definitionsByKey.set(definition.key, definition);
  };

  for (const gig of state.gigs) {
    if (!hasOwn(gig, 'venueIds')) {
      addOwner(gig);
    }
  }

  for (const gigCandidate of state.gigCandidates) {
    if (
      isRecord(gigCandidate.gigDraft) &&
      !hasOwn(gigCandidate, 'localityId') &&
      !hasOwn(gigCandidate.gigDraft, 'venueIds')
    ) {
      addOwner(gigCandidate.gigDraft);
    }
  }

  return Array.from(definitionsByKey.values()).sort((left, right) =>
    compareNames(left.name, right.name),
  );
}

function isUsableLocality(
  locality: LocalityMigrationDocument,
): locality is UsableLocalityMigrationDocument {
  return (
    locality._id instanceof Types.ObjectId &&
    typeof locality.countryIso === 'string' &&
    typeof locality.name === 'string' &&
    isValidLocalityName(locality.name) &&
    (locality.qualifier === undefined ||
      (typeof locality.qualifier === 'string' &&
        isValidLocalityQualifier(locality.qualifier))) &&
    Array.isArray(locality.aliases) &&
    locality.aliases.every((alias) => typeof alias === 'string') &&
    isValidLocalityAliases(locality.name, locality.aliases) &&
    typeof locality.timeZone === 'string' &&
    isValidLocalityTimeZone(locality.timeZone)
  );
}

function matchesLocalityDefinition(
  locality: LocalityMigrationDocument,
  definition: LocalityDefinition,
): boolean {
  return (
    locality.countryIso === definition.countryIso &&
    typeof locality.name === 'string' &&
    toNameKey(locality.name) === toNameKey(definition.name) &&
    locality.qualifier === undefined
  );
}

function isUsableDefinedLocality(
  locality: LocalityMigrationDocument,
  definition: LocalityDefinition,
): locality is UsableLocalityMigrationDocument {
  return (
    matchesLocalityDefinition(locality, definition) &&
    isUsableLocality(locality) &&
    locality.timeZone === definition.timeZone
  );
}

function createLocality(
  definition: LocalityDefinition,
  localityId: Types.ObjectId,
): LocalityInsertDocument {
  return {
    _id: localityId,
    countryIso: definition.countryIso,
    name: definition.name,
    aliases: [...definition.aliases],
    timeZone: definition.timeZone,
  };
}

function isUsableVenue(
  venue: VenueMigrationDocument,
): venue is UsableVenueMigrationDocument {
  return (
    venue._id instanceof Types.ObjectId &&
    venue.localityId instanceof Types.ObjectId &&
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
  venuesById: Map<string, UsableVenueMigrationDocument>,
): boolean {
  let localityId: string | undefined;

  for (const venueId of venueIds) {
    const venue = venuesById.get(venueId.toHexString());
    if (venue === undefined) {
      return false;
    }
    const venueLocalityId = venue.localityId.toHexString();
    localityId ??= venueLocalityId;
    if (localityId !== venueLocalityId) {
      return false;
    }
  }

  return true;
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

function getRequiredLocalityDefinitions(
  venueDefinitions: VenueDefinition[],
): LocalityDefinition[] {
  const requiredKeys = new Set<LocalityKey>([BARCELONA_LOCALITY_KEY]);
  for (const venueDefinition of venueDefinitions) {
    requiredKeys.add(venueDefinition.localityKey);
  }

  return LOCALITY_DEFINITIONS.filter((definition) =>
    requiredKeys.has(definition.key),
  );
}

function buildLocalityPlan(
  state: LegacyLocationMigrationState,
  definitions: LocalityDefinition[],
  blockingReasons: string[],
): {
  localityIdsByKey: Map<LocalityKey, Types.ObjectId>;
  localitiesToInsert: LocalityInsertDocument[];
} {
  const localityIdsByKey = new Map<LocalityKey, Types.ObjectId>();
  const localitiesToInsert: LocalityInsertDocument[] = [];

  for (const definition of definitions) {
    const matches = state.localities.filter((locality) =>
      matchesLocalityDefinition(locality, definition),
    );
    if (matches.length > 1) {
      blockingReasons.push(
        `Multiple ${definition.name} Locality records exist.`,
      );
      continue;
    }

    const existing = matches[0];
    if (existing === undefined) {
      const localityId = new Types.ObjectId();
      localitiesToInsert.push(createLocality(definition, localityId));
      localityIdsByKey.set(definition.key, localityId);
      continue;
    }
    if (!isUsableDefinedLocality(existing, definition)) {
      blockingReasons.push(
        `The existing ${definition.name} Locality is not usable by the migration.`,
      );
      continue;
    }

    localityIdsByKey.set(definition.key, existing._id);
  }

  return { localityIdsByKey, localitiesToInsert };
}

function buildVenuePlan(
  state: LegacyLocationMigrationState,
  definitions: VenueDefinition[],
  localityIdsByKey: Map<LocalityKey, Types.ObjectId>,
  blockingReasons: string[],
): {
  venueIdsByDefinitionKey: Map<string, Types.ObjectId>;
  venuesToInsert: VenueInsertDocument[];
} {
  const venueIdsByDefinitionKey = new Map<string, Types.ObjectId>();
  const venuesToInsert: VenueInsertDocument[] = [];

  for (const definition of definitions) {
    const localityId = localityIdsByKey.get(definition.localityKey);
    if (localityId === undefined) {
      continue;
    }

    const matches = state.venues.filter(
      (venue) =>
        venue.localityId instanceof Types.ObjectId &&
        venue.localityId.equals(localityId) &&
        typeof venue.name === 'string' &&
        toNameKey(venue.name) === toNameKey(definition.name),
    );
    if (matches.length > 1) {
      blockingReasons.push(
        `Multiple ${definition.name} Venue records exist in the target Locality.`,
      );
      continue;
    }

    const existing = matches[0];
    if (existing !== undefined) {
      if (!isUsableVenue(existing)) {
        blockingReasons.push(
          `The existing ${definition.name} Venue is not usable by the migration.`,
        );
        continue;
      }
      venueIdsByDefinitionKey.set(definition.key, existing._id);
      continue;
    }

    const venue: VenueInsertDocument = {
      _id: new Types.ObjectId(),
      localityId,
      name: definition.name,
      aliases: [...definition.aliases],
      isActive: definition.isActive,
    };
    venuesToInsert.push(venue);
    venueIdsByDefinitionKey.set(definition.key, venue._id);
  }

  return { venueIdsByDefinitionKey, venuesToInsert };
}

function buildMigrationPlan(
  state: LegacyLocationMigrationState,
): MigrationPlan {
  const blockingReasons: string[] = [];
  const requiredVenueDefinitions = collectRequiredVenueDefinitions(state);
  const requiredLocalityDefinitions = getRequiredLocalityDefinitions(
    requiredVenueDefinitions,
  );
  const localityPlan = buildLocalityPlan(
    state,
    requiredLocalityDefinitions,
    blockingReasons,
  );
  const venuePlan = buildVenuePlan(
    state,
    requiredVenueDefinitions,
    localityPlan.localityIdsByKey,
    blockingReasons,
  );

  const allLocalities = [
    ...state.localities,
    ...localityPlan.localitiesToInsert,
  ].filter(isUsableLocality);
  const localityIds = new Set(
    allLocalities.map((locality) => locality._id.toHexString()),
  );
  const allVenues = [...state.venues, ...venuePlan.venuesToInsert]
    .filter(isUsableVenue)
    .filter((venue) => localityIds.has(venue.localityId.toHexString()));
  const venuesById = new Map(
    allVenues.map((venue) => [venue._id.toHexString(), venue]),
  );

  const gigPlan = buildGigAssignmentPlan(
    state.gigs,
    venuePlan.venueIdsByDefinitionKey,
    venuesById,
  );
  const gigCandidatePlan = buildGigCandidateAssignmentPlan(
    state.gigCandidates,
    localityPlan.localityIdsByKey,
    venuePlan.venueIdsByDefinitionKey,
    venuesById,
    localityIds,
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
    localityIdsByKey: localityPlan.localityIdsByKey,
    localitiesToInsert: localityPlan.localitiesToInsert,
    venuesToInsert: venuePlan.venuesToInsert,
    gigBackfills: gigPlan.backfills,
    gigCandidateBackfills: gigCandidatePlan.backfills,
    fallbackVenueAssignments: [
      ...gigPlan.fallbackVenueAssignments,
      ...gigCandidatePlan.fallbackVenueAssignments,
    ],
    snapshot: {
      catalog: {
        requiredLocalityNames: requiredLocalityDefinitions.map(
          ({ name }) => name,
        ),
        missingLocalityNames: localityPlan.localitiesToInsert.map(
          ({ name }) => name,
        ),
        requiredVenueNames: requiredVenueDefinitions.map(({ name }) => name),
        missingVenueNames: venuePlan.venuesToInsert.map(({ name }) => name),
      },
      gigs: gigPlan.snapshot,
      gigCandidates: gigCandidatePlan.snapshot,
      blockingReasons,
    },
  };
}

function getVenueIdForLegacyValue(
  legacyVenue: LegacyVenue,
  venueIdsByDefinitionKey: Map<string, Types.ObjectId>,
): { definition: VenueDefinition; venueId?: Types.ObjectId } {
  const definition = getVenueDefinition(legacyVenue);
  return {
    definition,
    venueId: venueIdsByDefinitionKey.get(definition.key),
  };
}

function buildGigAssignmentPlan(
  gigs: GigLocationMigrationDocument[],
  venueIdsByDefinitionKey: Map<string, Types.ObjectId>,
  venuesById: Map<string, UsableVenueMigrationDocument>,
): EntityAssignmentPlan<GigVenueBackfill> {
  const snapshot = createEmptyAssignmentSnapshot(gigs.length);
  const backfills: GigVenueBackfill[] = [];
  const fallbackVenueAssignments: FallbackVenueAssignment[] = [];

  for (const gig of gigs) {
    if (!(gig._id instanceof Types.ObjectId)) {
      addBlockingRecord(snapshot, gig._id);
      continue;
    }
    if (hasOwn(gig, 'venueIds')) {
      const venueIds = readObjectIdArray(gig.venueIds);
      if (venueIds !== null && hasValidVenueAssignment(venueIds, venuesById)) {
        snapshot.valid += 1;
      } else {
        addBlockingRecord(snapshot, gig._id);
      }
      continue;
    }

    const legacyVenue = readLegacyVenue(gig);
    if (legacyVenue.kind !== 'valid') {
      addBlockingRecord(snapshot, gig._id);
      continue;
    }
    const target = getVenueIdForLegacyValue(
      legacyVenue.venue,
      venueIdsByDefinitionKey,
    );
    if (target.venueId === undefined) {
      addBlockingRecord(snapshot, gig._id);
      continue;
    }
    if (target.definition.key === FALLBACK_VENUE_KEY) {
      fallbackVenueAssignments.push({
        source: 'gig',
        recordId: gig._id.toHexString(),
        legacyVenue: legacyVenue.venue.name,
      });
    }

    backfills.push({ id: gig._id, venueIds: [target.venueId] });
    snapshot.missing += 1;
    snapshot.venueBackfills += 1;
  }

  snapshot.blockingRecordIds.sort();
  return { snapshot, backfills, fallbackVenueAssignments };
}

function buildGigCandidateAssignmentPlan(
  gigCandidates: GigCandidateLocationMigrationDocument[],
  localityIdsByKey: Map<LocalityKey, Types.ObjectId>,
  venueIdsByDefinitionKey: Map<string, Types.ObjectId>,
  venuesById: Map<string, UsableVenueMigrationDocument>,
  localityIds: Set<string>,
): EntityAssignmentPlan<GigCandidateLocationBackfill> {
  const snapshot = createEmptyAssignmentSnapshot(gigCandidates.length);
  const backfills: GigCandidateLocationBackfill[] = [];
  const fallbackVenueAssignments: FallbackVenueAssignment[] = [];

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
      if (venueIds !== null && hasValidVenueAssignment(venueIds, venuesById)) {
        snapshot.valid += 1;
      } else {
        addBlockingRecord(snapshot, gigCandidate._id);
      }
      continue;
    }
    if (hasLocalityId) {
      if (
        gigCandidate.localityId instanceof Types.ObjectId &&
        localityIds.has(gigCandidate.localityId.toHexString()) &&
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
      const target = getVenueIdForLegacyValue(
        legacyVenue.venue,
        venueIdsByDefinitionKey,
      );
      if (target.venueId === undefined) {
        addBlockingRecord(snapshot, gigCandidate._id);
        continue;
      }
      if (target.definition.key === FALLBACK_VENUE_KEY) {
        fallbackVenueAssignments.push({
          source: 'gigCandidate',
          recordId: gigCandidate._id.toHexString(),
          legacyVenue: legacyVenue.venue.name,
        });
      }
      backfills.push({
        kind: 'venues',
        id: gigCandidate._id,
        venueIds: [target.venueId],
      });
      snapshot.missing += 1;
      snapshot.venueBackfills += 1;
      continue;
    }

    const barcelonaLocalityId = localityIdsByKey.get(BARCELONA_LOCALITY_KEY);
    if (
      legacyVenue.kind === 'missing' &&
      gigCandidate.status !== APPROVED_GIG_CANDIDATE_STATUS &&
      barcelonaLocalityId !== undefined
    ) {
      backfills.push({
        kind: 'locality',
        id: gigCandidate._id,
        localityId: barcelonaLocalityId,
      });
      snapshot.missing += 1;
      snapshot.localityBackfills += 1;
      continue;
    }

    addBlockingRecord(snapshot, gigCandidate._id);
  }

  snapshot.blockingRecordIds.sort();
  return { snapshot, backfills, fallbackVenueAssignments };
}

function projectState(
  state: LegacyLocationMigrationState,
  plan: MigrationPlan,
): LegacyLocationMigrationState {
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
    localities: [
      ...state.localities.map((document) => ({ ...document })),
      ...plan.localitiesToInsert.map((document) => ({ ...document })),
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

function emptyWriteResult(): LocationMigrationWriteResult {
  return { matchedCount: 0, modifiedCount: 0, insertedCount: 0 };
}

function isSnapshotComplete(
  snapshot: LegacyLocationMigrationSnapshot,
): boolean {
  return (
    snapshot.blockingReasons.length === 0 &&
    snapshot.catalog.missingLocalityNames.length === 0 &&
    snapshot.catalog.missingVenueNames.length === 0 &&
    snapshot.gigs.missing === 0 &&
    snapshot.gigs.valid === snapshot.gigs.total &&
    snapshot.gigCandidates.missing === 0 &&
    snapshot.gigCandidates.valid === snapshot.gigCandidates.total
  );
}

export async function runLegacyLocationMigration(
  store: LegacyLocationMigrationStore,
  isDryRun: boolean,
): Promise<LegacyLocationMigrationReport> {
  const beforeState = await store.readState();
  const plan = buildMigrationPlan(beforeState);
  const projectedAfter = buildMigrationPlan(
    projectState(beforeState, plan),
  ).snapshot;
  const canApply =
    plan.snapshot.blockingReasons.length === 0 &&
    isSnapshotComplete(projectedAfter);
  const writes: LegacyLocationMigrationWrites = {
    localities: emptyWriteResult(),
    venues: emptyWriteResult(),
    gigs: emptyWriteResult(),
    gigCandidates: emptyWriteResult(),
  };

  if (!isDryRun && canApply) {
    if (plan.localitiesToInsert.length > 0) {
      writes.localities = await store.insertLocalities(plan.localitiesToInsert);
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
    throw new Error('Legacy location migration post-apply invariants failed');
  }

  const localities = Array.from(
    plan.localityIdsByKey,
    ([key, id]): LocalityReportItem => {
      const definition = LOCALITY_DEFINITIONS.find((item) => item.key === key);
      if (definition === undefined) {
        throw new Error(`Missing Locality definition for "${key}".`);
      }
      return { id: id.toHexString(), name: definition.name };
    },
  ).sort((left, right) => compareNames(left.name, right.name));

  return {
    mode: isDryRun ? 'dry-run' : 'apply',
    localities,
    plannedLocalityNames: plan.localitiesToInsert.map(({ name }) => name),
    plannedVenueNames: plan.venuesToInsert.map(({ name }) => name),
    fallbackVenueAssignments: plan.fallbackVenueAssignments,
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
): LegacyLocationMigrationStore {
  const localities = connection.collection('localities');
  const venues = connection.collection('venues');
  const gigs = connection.collection('gigs');
  const gigCandidates = connection.collection('gigcandidates');

  return {
    async readState(): Promise<LegacyLocationMigrationState> {
      const [localityRows, venueRows, gigRows, gigCandidateRows] =
        await Promise.all([
          localities
            .find(
              {},
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
    async insertLocalities(localityDocuments) {
      const result = await localities.insertMany(localityDocuments);
      return {
        matchedCount: 0,
        modifiedCount: 0,
        insertedCount: result.insertedCount,
      };
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
  const report = await runLegacyLocationMigration(
    createMongoStore(connection),
    isDryRun,
  );

  console.info(JSON.stringify(report, null, 2));
  if (!report.canApply) {
    throw new Error(
      `Legacy location migration blocked: ${[
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
