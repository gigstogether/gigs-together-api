# Location Architecture

This document defines the boundary between physical geography in
`LocationModule` and editorial audiences in `CommunityModule`, together with the
target domain model for Countries, Regions, Localities, Communities, physical
event Places, and future geographic matching.

## Module Boundary

`LocationModule` owns physical geographic reference data. It currently serves
countries and owns Region persistence and lookup. It will also own Locality and
Place. It does not own Community persistence, Gig moderation, feed delivery,
Telegram workflows, or calendar integration.

`CommunityModule` owns Community persistence, public catalog reads, and lookup
by ID or route. It depends on `LocationModule` through `CountryService` to verify
that every Community references a supported country.

Current persistence:

- `Country`
- `Region`

Current editorial-audience persistence:

- `Community`, owned by `CommunityModule`

Target geographic catalog:

```text
Country -> Region -> Locality -> Place
```

`Country`, `Region`, and `Locality` describe physical geography. `Place`
identifies a reusable physical event location. `Community` remains an independent
editorial audience and feed assignment.

Every collection has its own repository boundary. One feature service may depend
on another feature's application service, but a repository must not query a model
owned by another feature. For example, Region creation verifies `countryIso`
through `CountryService`; `RegionRepository` does not query the Country model.

`LocationModule` owns Region persistence and application behavior and exports
`RegionService`. `AdminModule` owns the authenticated administrative HTTP
controller and its versioned Region request and response contracts.

Region, Locality, and Place are introduced incrementally. Gig responses and
physical-location integrations continue to use the legacy `country`, `city`, and
`venue` fields until the catalog, runtime relationships, and migration are ready.

## Country

`Country` is the root of the physical geographic catalog. Its unique uppercase
ISO 3166-1 alpha-2 `iso` value is the relationship key used by Region. Region does
not store a separate Country ObjectId.

Creating a Region must verify through the Country application and repository
boundary that its `countryIso` exists in the Country collection. A syntactically
valid but unsupported code must not create a Region.

`CountryService` lazily loads the small reference collection and keeps both the
ordered catalog and a set of ISO codes in process memory. HTTP DTOs normalize and
validate external ISO syntax, while application services ask CountryService
whether the code is part of the supported catalog. Region and Community do not
maintain a separate ISO regex. Because Country has no runtime mutation API,
catalog changes take effect after an application restart.

## Region

`Region` is a deliberately simple grouping below Country. The model does not yet
declare whether a Region is an autonomous community, province, state, department,
or another administrative category. That distinction may be introduced after
the catalog has real multi-country requirements.

The Region model contains:

- an opaque stable `id`
- `countryIso`, which references an existing Country by its unique ISO code
- a required canonical `name`
- required `aliases`, which may be empty and provide alternative searchable names

Region names and aliases are stored directly in the entity. They do not depend on
translation records. The canonical name remains available for administration,
search, and data integrity even when no locale-specific display name exists.

Region has no `isActive` state. An unused erroneous Region may be deleted. Once
Locality is introduced, a Region referenced by a Locality must not be deleted
until those references have been moved or removed.

## Locality

`Locality` represents the city, town, settlement, municipality, or other local
territory used to locate a Place. The target model contains:

- an opaque stable `id`
- `regionId`, which references a Region
- a required canonical `name`
- required searchable `aliases`, which may be empty
- a required IANA `timeZone`

Country is resolved through Locality's Region and is not duplicated on Locality.
Locality has no `isActive` state. Geographic names remain canonical stored data;
aliases may initially cover alternative-language spellings without introducing a
translation dependency.

## Place

`Place` is a reusable catalog entity representing a concrete physical event
location. It replaces the previous plan for an embedded Place value object and a
separate future Venue entity. Clubs, concert halls, festival grounds, and
temporary festival locations use the same Place model.

The target Place model contains:

- an opaque stable `id`
- `localityId`, which references a Locality
- a required canonical `name`
- required searchable `aliases`, which may be empty
- `isActive`, which controls whether the Place may be assigned to new events

Country, Region, and time zone are resolved through Locality. They are not
duplicated on Place. A temporary or closed Place remains available to historical
Gigs but is excluded from new assignments after deactivation.

Address and coordinates are intentionally excluded until a consumer and a
reliable data-entry or geocoding boundary exist. Multiple stages inside one
festival site remain one Place. Independently addressable venues used by the same
festival are separate Places.

Place names are not unique. Two physical locations may share a name, including
within one Locality. Aliases support variants such as `Razzmatazz`,
`Sala Razzmatazz`, and `Razzmatazz 1`; catalog search and moderation provide the
deduplication workflow instead of a potentially incorrect unique-name constraint.

## Community

A Community represents a geographic audience and feed, not a municipal boundary
and not the physical place of an event. For example, the Barcelona Community may
contain an event in Badalona or a festival outside Barcelona.

The current Community model contains:

- an opaque stable `id` used by application and persistence relationships
- `countryIso`, stored as an uppercase ISO 3166-1 alpha-2 code
- `slug`, used as the human-readable route segment within a country
- `nameTranslationKey`, used with the fixed `community` namespace to resolve the
  localized Community name
- `timeZone`, stored as an IANA time-zone identifier for Community-level scheduling
- `isActive`, which controls new assignments and public catalog visibility

Community does not also store a canonical `name`. Its label is translatable UI
content, while Region, Locality, and Place names are canonical catalog data.

The pair `countryIso + slug` is unique. The opaque `id`, rather than the slug, is
stored on Gigs and GigCandidates so a route slug can change without rewriting all
relationships.

The initial model intentionally has no default Community, custom sort position, or
geographic coverage. The existing Barcelona entry route remains an explicit
application decision until the product introduces a Community chooser or another
root-route policy.

## Community Routes and Catalog

The canonical feed route keeps its existing shape:

```text
/feed/:country/:communitySlug
```

For example, `/feed/es/barcelona` addresses the Barcelona Community. The
`barcelona` segment describes an audience and does not assert that every event is
physically inside Barcelona. Feed queries resolve `countryIso + communitySlug` to
a Community `id` and use that ID for stored relationships.

The public active Community catalog is exposed as:

```text
GET /v1/communities
```

The response exposes `nameTranslationNamespace: "community"` once at the catalog
level and contains a `communities` array. The endpoint returns active Communities
only, so `isActive` is intentionally omitted from the wire contract.

## Community Assignments

A Gig may appear in one or more Community feeds. Assignments are stored at:

```text
Gig.communityIds[]
GigCandidate.gigDraft.communityIds[]
```

Assignments are non-empty, contain no duplicates, and reference existing
Communities. New assignments may target only active Communities. Changing the
physical Places does not silently rewrite Community assignments.

Assignments are explicit snapshots. An admin action such as "select all
Communities in Spain" resolves the currently active Spanish Communities and
stores their concrete IDs. A Community created later is not retroactively added
to older Gigs.

Feed cache revalidation resolves every assigned Community ID to its
`countryIso + slug` route and invalidates all corresponding feed paths. It also
resolves inactive assigned Communities so an old feed path can be cleared after a
Community is deactivated.

The bootstrap migration
`1793750400000-bootstrap-barcelona-community-assignments` creates the Barcelona
Community and its English `community / barcelona.name` translation when absent,
then assigns all historical Gigs and GigCandidates to it.

## Gig Place Assignments

A Gig references one or more physical locations:

```text
Gig.placeIds[]
GigCandidate.gigDraft.placeIds[]
```

Approved Gig assignments are non-empty, contain no duplicate IDs, and reference
active Places at creation time. All Places assigned to one Gig must resolve to the
same Country and IANA time zone, while different Localities are allowed. A
multi-venue festival stores every independently addressable venue in `placeIds`;
the array order does not imply a primary venue.

GigCandidate may additionally preserve unresolved source proposals until an admin
selects an existing Place or creates a catalog entry. Approval requires all final
physical locations to be resolved to `placeIds`. The exact candidate proposal
wire contract must be reviewed before implementation.

Legacy `country`, `city`, and `venue` remain in runtime contracts until Region,
Locality, and Place persistence and the Gig relationship migration are complete.
The migration must run only after the final runtime schemas have been reviewed.

## Geographic Suggestions

Geographic coverage is not part of the initial Community persistence model. A
later increment may use explicit Region and Locality coverage to suggest
Communities during moderation. Radius-based matching may be added after Place has
a reliable coordinate source.

Suggestions never mutate assignments on their own. The source Community provides
the initial assignment, geography supplies additional suggestions, and the admin
confirms the final `communityIds`. Manual editorial relevance takes precedence
over physical distance.

## Related Module Responsibilities

`LocationModule` owns:

- Country, Region, Locality, and Place persistence through separate repository
  boundaries

`CommunityModule` owns:

- Community persistence through its repository boundary
- Community lookup by ID and route
- active Community catalog reads
- validation of Community country references through `CountryService`
- future geography-to-Community suggestion rules and orchestration

Downstream feature modules own their application behavior:

- `GigModule` owns Gig relationships to Communities and Places
- `GigCandidateModule` owns draft assignments and moderation decisions
- `TelegramUpdatesModule` resolves the source Community for incoming suggestions
- `TelegramModule` resolves Community-specific delivery destinations
- `DigestModule` creates Community-specific digests
- `CalendarModule` uses the Locality time zone resolved through Place

Downstream modules depend on the owning application boundary and must not query
Location- or Community-owned Mongo models directly.
