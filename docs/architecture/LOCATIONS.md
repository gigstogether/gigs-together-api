# Location Architecture

This document defines the boundary between physical geography in
`LocationModule` and editorial audiences in `CommunityModule`, together with the
target domain model for Countries, Localities, Communities, physical
event Places, and future geographic matching.

## Module Boundary

`LocationModule` owns physical geographic reference data. It serves the
supported ISO country catalog and owns Locality and Place persistence and lookup. It does
not own Community persistence, Gig moderation, feed delivery, Telegram
workflows, or calendar integration.

`CommunityModule` owns Community persistence, public catalog reads, and lookup
by ID or route. It depends on `LocationModule` through `CountryService` to verify
that every Community references a supported country.

Current persistence:

- `Locality`
- `Place`

Current editorial-audience persistence:

- `Community`, owned by `CommunityModule`

The two independent relationship axes are:

```text
ISO country code → Locality → Place
Gig / GigCandidate → Community[]
```

`Locality` is a named geographic context used to locate a Place. It is not
necessarily a city: it may represent a town, municipality, broader
administrative area, or another useful geographic context for an event.

`Place` is a concrete reusable physical event location, such as a club, concert
hall, festival ground, or temporary festival site.

`Community` is an event audience and feed assignment. It is independent from the
physical location hierarchy, so one Gig may be assigned to multiple Communities
regardless of where its Places are located.

`Region` is not an entity in the project. Administrative context needed to
distinguish equal Locality names belongs in `Locality.qualifier`; the project does
not maintain a separate Region catalog or relationship.

Every collection has its own repository boundary. One feature service may depend
on another feature's application service, but a repository must not query a model
owned by another feature. Locality creation verifies `countryIso` through
`CountryService` before `LocalityRepository` persists it.

`LocationModule` owns the static Country catalog together with Locality and Place
persistence and application behavior. `AdminModule` owns the authenticated
administrative HTTP controllers and their versioned Locality and Place request
and response contracts.

Gig relationships are introduced separately. Gig responses and physical-location
integrations continue to use the legacy `country`, `city`, and `venue` fields
until the runtime relationships and migration are ready.

## Country

Country is reference data rather than a Mongo entity. `CountryService` owns the
versioned in-code snapshot of supported uppercase ISO 3166-1 alpha-2 codes and
exposes both the complete public catalog and membership validation. The snapshot
is sourced from the English UNSD M49 table and is updated explicitly in code so
ordinary requests never depend on external network or HTML availability.

`GET /v1/countries` returns every supported ISO code. Clients localize country
names with `Intl.DisplayNames`; country-name translations are not stored. There
is no Country collection, ObjectId, repository, configured-country state, or
Country administration API.

Locality and Community store `countryIso` directly and validate it through
`CountryService`. HTTP DTOs still normalize and validate external ISO syntax,
while application services enforce membership in the supported catalog.

## Locality

`Locality` represents a named geographic context used to locate a Place. It is
not required to be a city: a town, settlement, municipality, broader
administrative area, or another useful geographic context is valid. The current
model contains:

- an opaque stable `id`
- `countryIso`, which must be a supported ISO 3166-1 alpha-2 code
- a required canonical `name`
- an optional canonical `qualifier` for disambiguating equal names
- required searchable `aliases`, which may be empty
- a required IANA `timeZone`

Locality has no `isActive` state. Geographic names and qualifiers remain
canonical stored data; aliases may initially cover alternative-language
spellings without introducing a translation dependency.

The tuple `countryIso + name + qualifier` is unique using case-insensitive
collation. Admin catalog reads may filter by `countryIso` and search canonical
names, qualifiers, and aliases. The `countryIso` relationship is immutable in the
current update contract.
Localities referenced by Places cannot be deleted.

## Place

`Place` is a reusable catalog entity representing a concrete physical event
location. It replaces the previous plan for an embedded Place value object and a
separate future Venue entity. Clubs, concert halls, festival grounds, and
temporary festival locations use the same Place model.

The current Place model contains:

- an opaque stable `id`
- `localityId`, which references a Locality
- a required canonical `name`
- required searchable `aliases`, which may be empty
- `isActive`, which controls whether the Place may be assigned to new events

Country and time zone are resolved through Locality. They are not
duplicated on Place. A temporary or closed Place remains available to historical
Gigs but is excluded from new assignments after deactivation.

Address and coordinates are intentionally excluded until a consumer and a
reliable data-entry or geocoding boundary exist. Multiple stages inside one
festival site remain one Place. Independently addressable venues used by the same
festival are separate Places.

The pair `localityId + name` is unique using case-insensitive collation because
the current model has no address or coordinates with which to distinguish exact
name collisions inside one Locality. When a real collision exists, the canonical
names must include a stable qualifier such as a district or branch. Aliases
support variants such as `Razzmatazz` and `Sala Razzmatazz` without creating
duplicate Places.

## Community

A Community represents an event audience and feed, not a municipal boundary
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
content, while Locality and Place names are canonical catalog data.

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

Legacy `country`, `city`, and `venue` remain in runtime contracts until the Gig
relationships and their migration are complete. The migration must run only
after the final runtime schemas have been reviewed.

## Geographic Suggestions

Geographic coverage is not part of the initial Community persistence model. A
later increment may use explicit Country and Locality coverage to suggest
Communities during moderation. Radius-based matching may be added after Place has
a reliable coordinate source.

Suggestions never mutate assignments on their own. The source Community provides
the initial assignment, geography supplies additional suggestions, and the admin
confirms the final `communityIds`. Manual editorial relevance takes precedence
over physical distance.

## Related Module Responsibilities

`LocationModule` owns:

- the static supported Country catalog through `CountryService`
- Locality and Place persistence through separate repository boundaries

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
