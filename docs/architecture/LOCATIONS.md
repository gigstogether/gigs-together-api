# Location Architecture

This document defines the boundary between physical geography in `LocationModule` and editorial audiences in
`CommunityModule`, together with the current domain model for Countries, Localities, Communities, physical event Venues,
and future geographic matching.

## Module Boundary

`LocationModule` owns physical geographic reference data. It serves the supported ISO country catalog and owns Locality
and Venue persistence and lookup. It does not own Community persistence, Gig moderation, feed delivery, Telegram
workflows, or calendar integration.

`CommunityModule` owns Community persistence, public catalog reads, and lookup by ID or route. It depends on
`LocationModule` through `CountryService` to verify that every Community references a supported country.

Current persistence:

- `Locality`
- `Venue`

Current editorial-audience persistence:

- `Community`, owned by `CommunityModule`

The two independent relationship axes are:

```text
ISO country code → Locality → Venue
Gig / GigCandidate → Community[]
```

`Locality` is a named geographic context used to locate a Venue. It is not necessarily a city: it may represent a town,
municipality, broader administrative area, or another useful geographic context for an event.

`Venue` is a concrete reusable physical event location, such as a club, concert hall, festival ground, or temporary
festival site.

`Community` is an event audience and feed assignment. It is independent from the physical location hierarchy, so one Gig
may be assigned to multiple Communities regardless of where its Venues are located.

`Region` is not an entity in the project. Administrative context needed to distinguish equal Locality names belongs in
`Locality.qualifier`; the project does not maintain a separate Region catalog or relationship.

Every collection has its own repository boundary. One feature service may depend on another feature's application
service, but a repository must not query a model owned by another feature. Locality creation verifies `countryIso`
through `CountryService` before `LocalityRepository` persists it.

`LocationModule` owns the static Country catalog together with Locality and Venue persistence and application behavior.
`AdminModule` owns the authenticated administrative HTTP controllers and their versioned Locality and Venue request and
response contracts.

Public and admin GigCandidate creation, moderation, approval, Gig persistence, public Gig feed responses, Telegram text,
and calendar creation use the Locality and Venue catalogs. Gigs persist `venueIds`; incomplete GigCandidates may
temporarily persist `localityId` until moderation assigns one or more Venues. Gig and GigCandidate persistence and
resource contracts no longer depend on the legacy `country`, `city`, or `venue` fields.

## Country

Country is reference data rather than a Mongo entity. `CountryService` owns the versioned in-code snapshot of supported
uppercase ISO 3166-1 alpha-2 codes and exposes both the complete public catalog and membership validation. The snapshot
is sourced from the English UNSD M49 table and is updated explicitly in code so ordinary requests never depend on
external network or HTML availability.

`GET /v1/countries` returns every supported ISO code. Clients localize country names with `Intl.DisplayNames`;
country-name translations are not stored. The application has no Country collection, ObjectId, repository,
configured-country state, or Country administration API. A legacy physical collection may remain temporarily after a
deployment, but it is not an application data source and is removed through the deployment cleanup procedure.

Locality and Community store `countryIso` directly and validate it through `CountryService`. HTTP DTOs still normalize
and validate external ISO syntax, while application services enforce membership in the supported catalog.

## Locality

`Locality` represents a named geographic context used to locate a Venue. It is not required to be a city: a town,
settlement, municipality, broader administrative area, or another useful geographic context is valid. The current model
contains:

- an opaque stable `id`
- `countryIso`, which must be a supported ISO 3166-1 alpha-2 code
- a required canonical `name`
- an optional canonical `qualifier` for disambiguating equal names
- required searchable `aliases`, which may be empty
- a required IANA `timeZone`

Locality has no `isActive` state. Geographic names and qualifiers remain canonical stored data; aliases may initially
cover alternative-language spellings without introducing a translation dependency.

The tuple `countryIso + name + qualifier` is unique using case-insensitive collation. Admin catalog reads may filter by
`countryIso` and search canonical names, qualifiers, and aliases. The `countryIso` relationship is immutable in the
current update contract. Localities referenced by Venues cannot be deleted.

Locality deletion is currently disabled with `501 Not Implemented` while Venue and Community reference handling and
atomic coverage cleanup are being designed.

## Venue

`Venue` is a reusable catalog entity representing a concrete physical event location. It is the single model for clubs,
concert halls, festival grounds, and temporary festival locations; the project does not maintain a separate embedded
physical-location value object.

The current Venue model contains:

- an opaque stable `id`
- `localityId`, which references a Locality
- a required canonical `name`
- required searchable `aliases`, which may be empty
- `isActive`, which controls whether the Venue may be assigned to new events

Country and time zone come from Locality. They are not duplicated on Venue. A temporary or closed Venue remains
available to historical Gigs but is excluded from new assignments after deactivation.

Address and coordinates are intentionally excluded until a consumer and a reliable data-entry or geocoding boundary
exist. Multiple stages inside one festival site remain one Venue. Independently addressable venues used by the same
festival are separate Venues.

The pair `localityId + name` is unique using case-insensitive collation because the current model has no address or
coordinates with which to distinguish exact name collisions inside one Locality. When a real collision exists, the
canonical names must include a stable qualifier such as a district or branch. Aliases support variants such as
`Razzmatazz` and `Sala Razzmatazz` without creating duplicate Venues. Search comparison removes Unicode diacritics, so
mechanical variants such as `Olímpic` and `Olimpic` do not need to be stored as aliases.

## Community

A Community represents an event audience and feed, not a municipal boundary and not the physical venue of an event. For
example, the Barcelona Community may contain an event in Badalona or a festival outside Barcelona.

The current Community model contains:

- an opaque stable `id` used by application and persistence relationships
- `countryIso`, stored as an uppercase ISO 3166-1 alpha-2 code
- `slug`, used as the human-readable route segment within a country
- `nameTranslationKey`, used with the fixed `community` namespace to get the localized Community name
- `timeZone`, stored as an IANA time-zone identifier for Community-level scheduling
- `isActive`, which controls new assignments and public catalog visibility

Community does not also store a canonical `name`. Its label is translatable UI content, while Locality and Venue names
are canonical catalog data.

The pair `countryIso + slug` is unique. The opaque `id`, rather than the slug, is stored on Gigs and GigCandidates so a
route slug can change without rewriting all relationships.

The initial model intentionally has no default Community, custom sort position, or geographic coverage. The existing
Barcelona entry route remains an explicit application decision until the product introduces a Community chooser or
another root-route policy.

## Community Routes and Catalog

The canonical feed route keeps its existing shape:

```text
/feed/:country/:communitySlug
```

For example, `/feed/es/barcelona` addresses the Barcelona Community. The `barcelona` segment describes an audience and
does not assert that every event is physically inside Barcelona. Feed queries map `countryIso + communitySlug` to a
Community `id` and use that ID for stored relationships.

The public active Community catalog is exposed as:

```text
GET /v1/communities
```

The response exposes `nameTranslationNamespace: "community"` once at the catalog level and contains a `communities`
array. The endpoint returns active Communities only, so `isActive` is intentionally omitted from the wire contract.

## Community Administration

`/admin/communities` manages the current Community fields through create and edit dialogs. Names are selected from
existing English `community` translation records maintained in Text content. Activating a Community requires a
non-empty, active, plain-text name; an inactive Community may be saved before its translation is ready.

The authenticated admin API exposes:

- `GET /v1/admin/communities` — all Communities, including inactive entries
- `GET /v1/admin/communities/:id` — one Community
- `POST /v1/admin/communities` — create a Community (`201`)
- `PATCH /v1/admin/communities/:id` — change country, slug, name translation key, time zone, or active state

Duplicate country/slug pairs return `409`. Deactivation removes Communities from the public catalog and prevents new
assignments while retaining historical references. Community writes invalidate the public catalog and all Community feed
routes through the existing frontend revalidation integration.

Updates also return `409` if the checked Community snapshot changes before the database write.

`CommunityService` validates the active name through `TranslationService.findRecord`, which reads the exact namespace,
locale, and key from storage. The required name locale comes from `DEFAULT_LOCALE_ISO` in the Locale module. Other
existing locale defaults remain separate until their later consolidation.

`AdminCommunityService` coordinates cache revalidation after Community writes. Collection queries stay in their owning
repositories.

TODO: Add Community deletion in a separate change, including Gig and GigCandidate reference checks and protection
against concurrent assignments.

## Community Assignments

A Gig may appear in one or more Community feeds. Assignments are stored at:

```text
Gig.communityIds[]
GigCandidate.gigDraft.communityIds[]
```

Assignments are non-empty, contain no duplicates, and reference existing Communities. New assignments may target only
active Communities. Changing the physical Venues does not silently rewrite Community assignments.

Assignments are explicit snapshots. An admin action such as "select all Communities in Spain" loads the currently active
Spanish Communities and stores their concrete IDs. A Community created later is not retroactively added to older Gigs.

Feed cache revalidation maps every assigned Community ID to its `countryIso + slug` route and invalidates all
corresponding feed paths. It also loads inactive assigned Communities so an old feed path can be cleared after a
Community is deactivated.

The bootstrap migration `1793750400000-bootstrap-barcelona-community-assignments` creates the Barcelona Community and
its English `community / barcelona.name` translation when absent, then assigns all historical Gigs and GigCandidates to
it.

## Gig Venue Assignments

A Gig references one or more physical locations:

```text
Gig.venueIds[]
GigCandidate.gigDraft.venueIds[]
```

Approved Gig assignments are non-empty, contain no duplicate IDs, and reference active Venues at creation time. All
Venues assigned to one Gig must belong to the same Locality. A multi-venue festival stores every independently
addressable venue in `venueIds`; the array order does not imply a primary venue.

Approval validates the complete draft and loads `venueIds` through `VenueService`, and rejects missing, unknown,
inactive, duplicate, or cross-Locality assignments before the Gig and approved candidate state are written in one
transaction. Gig persistence stores Venue references as MongoDB ObjectIds and maps them back to opaque string IDs at the
repository boundary.

Public Gig feed reads load every page of Venue assignments in batches and return canonical location data instead of
legacy strings:

```text
Gig response → Locality { id, countryIso, name, qualifier? }
             → Venue[] { id, name }
```

Historical Gigs may continue to display inactive Venues. New assignments still require active Venues. Calendar links and
approval-side Calendar creation use the assigned Locality time zone, all assigned Venue names, and an English country
name obtained from `countryIso` through `Intl.DisplayNames`. If the runtime has no English display name for a supported
code, Calendar text falls back to the ISO code and the backend logs a warning. The Calendar locale is explicitly set to
English at the call site and may later be replaced with a dynamically selected locale without changing country-name
resolution.

`GigCandidate.gigDraft.communityIds` remains required for every source. Other draft fields remain optional so messenger
suggestions may be incomplete. A web form submission selects one existing Locality and may optionally select one active
Venue from that Locality. The Country field is only a Locality catalog filter and is not persisted on the candidate.

When the web form does not select a Venue, the candidate stores the selected Locality temporarily at
`GigCandidate.localityId`. When it selects a Venue, the candidate stores `gigDraft.venueIds` and omits the root
`localityId`. The two forms of assignment must never coexist. Approval requires the final physical location to contain a
non-empty `venueIds` array; moderation may replace the temporary Locality assignment with one or more Venues from that
same Locality.

## Migration and Legacy Cleanup

The one-way migration `1794787200000-bootstrap-legacy-location-assignments` mapped the audited legacy Venue strings to
canonical Venue records and created or reused their Localities. It assigned `venueIds` to every Gig, assigned
`gigDraft.venueIds` to candidates with a Venue, and used a temporary `localityId` for incomplete non-approved
candidates. Approved candidates without a usable Venue blocked the migration.

The one-way migration `1795564800000-remove-legacy-gig-location-fields` verifies the catalog relationships before
removing `country`, `city`, and `venue` from Gigs and GigCandidate drafts. It also removes the obsolete `city` and
`country` translation namespaces. Its dry run must report no invalid, missing, duplicate, or cross-Locality Venue
assignments before apply. A verified `mongodump` is required because the removed data is not reconstructed by `down`.

The application does not own or query City or Country collections. If legacy `cities` or `countries` collections still
exist after the catalog-based backend and cleanup migration have been deployed successfully, their document counts are
verified and the collections are dropped manually as an explicit deployment action recorded in the pull request. They
are not dropped by the data cleanup migration.

## Geographic Suggestions

Geographic coverage is not part of the initial Community persistence model. A later increment may use explicit Country
and Locality coverage to suggest Communities during moderation. Radius-based matching may be added after Venue has a
reliable coordinate source.

Suggestions never mutate assignments on their own. The source Community provides the initial assignment, geography
supplies additional suggestions, and the admin confirms the final `communityIds`. Manual editorial relevance takes
precedence over physical distance.

## Related Module Responsibilities

`LocationModule` owns:

- the static supported Country catalog through `CountryService`
- Locality and Venue persistence through separate repository boundaries

`CommunityModule` owns:

- Community persistence through its repository boundary
- Community lookup by ID and route
- active Community catalog reads
- validation of Community country references through `CountryService`
- future geography-to-Community suggestion rules and orchestration

Downstream feature modules own their application behavior:

- `GigModule` owns Gig relationships to Communities and Venues
- `GigCandidateModule` owns draft assignments and moderation decisions
- `TelegramUpdatesModule` selects the source Community for incoming suggestions
- `TelegramModule` selects Community-specific delivery destinations
- `DigestModule` creates Community-specific digests
- `GigModule` maps catalog location data into `CalendarModule` events through `GigCalendarService`

Downstream modules depend on the owning application boundary and must not query Location- or Community-owned Mongo
models directly.
