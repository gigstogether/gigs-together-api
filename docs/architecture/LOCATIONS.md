# Location Architecture

This document defines the current `LocationModule` boundary and the target domain
model for countries, Communities, physical event Places, and future geographic
matching.

## Current Module Boundary

`LocationModule` owns geographic reference data. It serves countries and owns
Community persistence and lookup. It does not own Gig
moderation, feed delivery, Telegram workflows, or calendar integration.

Current persistence:

- `Country`
- `Community`

Current main files:

- `src/modules/location/location.module.ts`
- `src/modules/location/country/countries.controller.ts`
- `src/modules/location/country/country.service.ts`
- `src/modules/location/country/country.schema.ts`
- `src/modules/location/country/repositories/country.repository.ts`
- `src/modules/location/country/repositories/mongo-country.repository.ts`
- `src/modules/location/community/community.schema.ts`
- `src/modules/location/community/community.service.ts`
- `src/modules/location/community/repositories/community.repository.ts`
- `src/modules/location/community/repositories/mongo-community.repository.ts`

`Country` remains an independently stored reference collection even when another
feature is its primary consumer. Country reads must continue to pass through the
Country-owned repository boundary; a Community repository must not query the
Country model. A Community application service may depend on both repository
interfaces when a use case needs Community and Country data.

Community persistence and lookup are implemented as described below. Place and
Community assignments will be introduced incrementally. The current Gig feed
continues to use its existing `country` and `city` fields until the corresponding
migrations and application changes are complete.

## Community

A Community represents a geographic audience and feed, not a municipal boundary
and not the physical place of an event. For example, the Barcelona Community may
contain an event in Badalona or a festival outside any municipality.

`LocationModule` owns Community persistence and lookup because Community is a
geographic catalog concept at this stage. If social membership, roles, or access
rules are introduced later, those concerns may require a separate domain boundary.

The initial Community model contains:

- an opaque stable `id` used by application and persistence relationships
- `countryIso`, stored as an uppercase ISO 3166-1 alpha-2 code
- `slug`, used as the human-readable route segment within a country
- `nameTranslationKey`, used with the fixed `community` namespace to resolve
  the localized Community name; keys identify the translated field, for example
  `barcelona.name`
- `timeZone`, stored as an IANA time-zone identifier for Community-level scheduling
- `isActive`, which controls whether the Community can receive new assignments and appear in public catalogs

The pair `countryIso + slug` is unique. The opaque `id`, rather than the slug, is
stored on Gigs and GigCandidates so a route slug can change without rewriting all
relationships.

The initial model intentionally has no default Community, custom sort position, or
geographic coverage. The existing Barcelona entry route remains an explicit
application decision until the product introduces a Community chooser or another
root-route policy. Public clients sort localized Community names themselves; a
manual sort position should be introduced only when the product requires curated
ordering.

## Community Routes

The canonical feed route keeps its existing shape:

```text
/feed/:country/:communitySlug
```

For example, `/feed/es/barcelona` addresses the Barcelona Community. The
`barcelona` segment describes an audience/feed and does not assert that every
event is physically inside Barcelona. Internal code should use names such as
`communitySlug` rather than `city` for this route segment.

The route pair resolves to a Community `id`. Feed queries and stored relationships
use that `id`; they do not use a derived compound key such as `es:barcelona`.

## Community Catalog API

The public active Community catalog is exposed as:

```text
GET /v1/communities
```

The response exposes `nameTranslationNamespace: "community"` once at the catalog
level and contains a `communities` array. Each item exposes the stable `id`,
`countryIso`, route `slug`, `nameTranslationKey`, and `timeZone`. The endpoint
returns active Communities only, so `isActive` is intentionally omitted from the
wire contract. Clients resolve the localized names and sort them for presentation.

## Legacy City Migration Boundary

The legacy `city` field currently has two responsibilities that must be migrated
separately:

- its feed-selection responsibility can move to explicit Community assignments
  before Place is introduced
- its physical event-locality responsibility remains until Place provides the
  replacement location fields

The frontend may switch feed routing and titles from the `city` translation
namespace to the `community` catalog during the Community rollout. The legacy
`city` namespace must remain available while Gig responses still expose physical
city codes. It can be removed only after the Place migration removes those final
consumers.

## Community Assignments

A Gig may appear in one or more Community feeds. The target Gig and GigCandidate
assignment field is:

```text
communityIds[]
```

The following invariants apply once assignments become required for an approved
Gig:

- `communityIds` is non-empty and contains no duplicates
- every referenced Community exists
- new assignments may target only active Communities
- changing the physical Place does not silently rewrite Community assignments

Assignments are explicit snapshots. An admin action such as "select all
Communities in Spain" resolves the currently active Spanish Communities and stores
their concrete IDs. A Community created later is not retroactively added to older
Gigs. Dynamic country-wide assignment rules may be introduced separately only if
that behavior becomes an explicit product requirement.

Integrations select their destinations explicitly from the assigned Communities
instead of relying on an arbitrary primary assignment. A Gig deep link identifies
the Gig independently from the Community feed through which it was discovered.

## Place

`Place` represents where an event physically occurs and is independent from its
Community assignments. The target model contains:

- `venue`, required for event display and integrations
- optional `locality`, because a festival may not belong to a municipality
- `countryIso`, required and stored as an uppercase ISO 3166-1 alpha-2 code
- optional `coordinates`, stored as a validated latitude/longitude pair
- `timeZone`, required for an approved Gig and stored as an IANA time-zone identifier

`addressText` and `region` are intentionally excluded from the first model because
there is no established address or geocoding boundary that owns them yet. They may
be added when an actual consumer and normalization contract exist.

Coordinates may be absent from legacy Gigs and incomplete GigCandidates. Missing
coordinates disable automatic geographic suggestions but do not prevent an admin
from assigning Communities explicitly.

## Future Geographic Suggestions

Geographic coverage is not part of the initial Community persistence model. A
later increment may add radius-based coverage and use Place coordinates to suggest
Communities during moderation. Suggestions never mutate assignments on their own:
the admin confirms the final `communityIds` and may add or remove any Community.

This preserves editorial relevance for events outside a default radius, events
between cities, and events intended for several Community audiences. A future
coverage model must use an explicit discriminator so radius and polygon variants
are narrowed by their declared kind rather than by incidental payload fields.

## Future Venue Catalog

A reusable Venue catalog is planned as a separate entity with its own identity,
lifecycle, persistence schema, and `VenueRepository`. It must not be stored through
`CommunityRepository` merely because Venue has geographic data.

`Place` remains the event's physical-location value object and is persisted by the
Gig or GigCandidate repository that owns the event data. When Venue references are
introduced, Place may reference a Venue by ID while retaining the event-specific
location data required for historical and integration behavior.

## Related Module Responsibilities

`LocationModule` owns:

- Country and Community persistence through separate repository boundaries
- Community lookup by ID and route
- active Community catalog reads
- future coordinate-to-Community suggestions
- the future Venue catalog through its own repository boundary

Downstream feature modules own their application behavior:

- `GigModule` owns feed queries and Gig Community relationships
- `GigCandidateModule` owns draft assignments and moderation decisions
- `TelegramUpdatesModule` resolves the source Community for incoming suggestions
- `TelegramModule` resolves Community-specific delivery destinations
- `DigestModule` creates Community-specific digests
- `CalendarModule` uses the physical Place time zone for event data

These downstream modules depend on the Location application boundary and must not
query Location-owned Mongo models directly.
