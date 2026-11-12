# Architecture Overview

This document explains how `gigs-together-api` is structured and where the main responsibilities live.

## Overview

The application is a modular NestJS monolith. Each domain lives in its own Nest module, while shared infrastructure is wired in the root module.

High-level flow:

```text
Clients
  -> HTTP controllers
  -> domain services
  -> infrastructure services
  -> MongoDB / external APIs
```

In practice:

- controllers accept HTTP requests and validate input
- domain services implement the business logic
- Mongoose models provide persistence
- infrastructure services wrap third-party systems such as Telegram, Google Calendar, S3-compatible storage, and AI APIs

## Bootstrap and Composition Root

### `src/main.ts`

`src/main.ts` starts the Nest app and configures:

- CORS
- URI-based API versioning
- HTTP server startup

### `src/app.module.ts`

`src/app.module.ts` is the composition root. It:

- loads environment variables from `.env.<NODE_ENV>` and `.env`
- creates the MongoDB connection through `MongooseModule.forRootAsync`
- enables the scheduler
- registers all feature modules
- applies a global exception filter
- applies a global `ValidationPipe`

## Module Map

### Core domain modules

#### `GigModule`

Responsibilities:

- owns gig persistence and public gig APIs
- owns explicit Gig-to-Community relationships
- owns Community-filtered Gig feed queries, response mapping, and frontend cache revalidation under `gig/gig-feed`
- exposes `GigService`, `GigFeedService`, and `GigFeedRevalidationService`
- owns Gig poster validation, download, and storage through `GigPosterService` under `gig/gig-poster`

Dependencies:

- `CalendarModule`
- `BucketModule`
- `RemoteImageModule`
- `AuthModule`
- `TelegramModule`
- `CommunityModule`
- local `Gig` Mongoose model

Main files:

- `src/modules/gig/gig.module.ts`
- `src/modules/gig/gig.controller.ts`
- `src/modules/gig/gig.service.ts`
- `src/modules/gig/gig.schema.ts`
- `src/modules/gig/gig-feed/gig-feed.service.ts`
- `src/modules/gig/gig-feed/gig-feed.mapper.ts`
- `src/modules/gig/gig-feed/gig-feed-revalidation.service.ts`
- `src/modules/gig/gig-poster/gig-poster.service.ts`

#### `GigCandidateModule`

Responsibilities:

- owns GigCandidate submission and moderation workflows
- keeps candidate lifecycle feedback in `GigCandidateFeedbackService`
- keeps candidate-specific poster selection and defaulting in `gig-candidate/gig-candidate-poster`, which delegates file validation and storage to `GigPosterService`
- keeps the atomic candidate-to-Gig approval flow under `gig-candidate/gig-candidate-approval`
- validates draft Community assignments and carries them into approved Gigs
- uses `GigFeedRevalidationService` from `GigModule` after a candidate becomes a Gig

Dependencies:

- `GigModule`
- `AiModule`
- `CalendarModule`
- `TelegramModule`
- `UserModule`
- `AuthModule`
- `CommunityModule`
- local `GigCandidate` Mongoose model

Main files:

- `src/modules/gig-candidate/gig-candidate.module.ts`
- `src/modules/gig-candidate/gig-candidate.service.ts`
- `src/modules/gig-candidate/gig-candidate-feedback.service.ts`
- `src/modules/gig-candidate/gig-candidate-poster/gig-candidate-poster.service.ts`
- `src/modules/gig-candidate/gig-candidate-approval/gig-candidate-approval.service.ts`
- `src/modules/gig-candidate/gig-candidate-approval/repositories/`

#### `DigestModule`

Responsibilities:

- owns weekly digest scheduling, eligibility, and successful-post state
- exposes the provider-neutral `DIGEST_DELIVERY` port to digest application services
- uses `TelegramDigestDeliveryAdapter` to translate Telegram results and failures at the integration boundary
- reports unattended scheduled and startup catch-up failures through `AlertingModule`

Dependencies:

- `GigModule`
- `TelegramModule`
- `AlertingModule`
- local `DigestPostState` Mongoose model

Main files:

- `src/modules/digest/digest.module.ts`
- `src/modules/digest/digest-delivery.ts`
- `src/modules/digest/adapters/telegram-digest-delivery.adapter.ts`
- `src/modules/digest/digest-cron.service.ts`
- `src/modules/digest/digest.service.ts`

#### `TelegramUpdatesModule`

Responsibilities:

- receives authenticated Telegram webhook updates
- routes bot messages and callback queries
- coordinates Telegram-triggered Gig and GigCandidate actions
- keeps inbound update orchestration separate from the foundational `TelegramModule`

Dependencies:

- `GigModule`
- `TelegramBotClientModule`
- `TelegramModule`
- `AuthModule`
- `GigCandidateModule`
- `UserModule`

Main files:

- `src/modules/telegram-updates/telegram-updates.module.ts`
- `src/modules/telegram-updates/telegram-updates.controller.ts`
- `src/modules/telegram-updates/telegram-updates.service.ts`

Supporting pieces:

- Telegram webhook authentication guard
- Telegram update and webhook exception filters

#### `LocaleModule`

Responsibilities:

- serves supported locales
- in-memory cache of active locale ISO codes (`LocaleService.getActiveLocaleIsos`, `resolveLocale`)
- Accept-Language resolution for translation reads

Persistence:

- `Locale`

[//]: # '- `Translation`'

Main files:

- `src/modules/locale/locale.module.ts`
- `src/modules/locale/locale.controller.ts`
- `src/modules/locale/locale.service.ts`

#### `TranslationModule`

Responsibilities:

- owns translation persistence, runtime cache, and template rendering
- reports runtime cache misses through `AlertingModule`
- deduplicates identical namespace, key, and locale misses until the relevant cache is successfully revalidated

Dependencies:

- `LocaleModule`
- `AlertingModule`

Main files:

- `src/modules/translation/translation.module.ts`
- `src/modules/translation/translation-cache.service.ts`
- `src/modules/translation/translation.service.ts`

#### `LocationModule`

Responsibilities:

- owns the physical geographic catalog
- owns Country, Locality, and Place persistence and application behavior
- loads official UNSD country choices only for authenticated Country administration
- owns geographic lookup without taking ownership of Gig assignments, moderation, or delivery integrations

Dependencies:

- local `Country`, `Locality`, and `Place` Mongoose models

Main files:

- `src/modules/location/location.module.ts`
- `src/modules/location/country/`
- `src/modules/location/locality/`
- `src/modules/location/place/`

#### `CommunityModule`

Responsibilities:

- owns the editorial Community catalog, persistence, and public API
- resolves Communities by ID or route for feed assignment and delivery use cases
- validates Community country references through the Location application boundary
- will own future geography-to-Community suggestion rules and orchestration
- keeps Community audiences independent from physical geographic boundaries

Dependencies:

- `LocationModule`
- local `Community` Mongoose model

Main files:

- `src/modules/community/community.module.ts`
- `src/modules/community/community.controller.ts`
- `src/modules/community/community.service.ts`
- `src/modules/community/community.schema.ts`

Detailed ownership, target models, and rollout constraints are documented in
[Location Architecture](./LOCATIONS.md).

### Integration and infrastructure modules

#### `AlertingModule`

Responsibilities:

- exposes the provider-neutral `AlertingService` application boundary
- models actionable internal alerts with opaque codes, severity, summaries, and safe attributes
- keeps alert definitions in the feature modules that own the reported conditions
- delegates delivery through the `ALERT_DELIVERY` port
- uses `TelegramAlertDeliveryService` as the initial delivery adapter
- centralizes structured failure logging from ready feature-owned alerts
- logs best-effort delivery failures without changing the originating application operation

Main files:

- `src/modules/alerting/alerting.module.ts`
- `src/modules/alerting/alerting.service.ts`
- `src/modules/alerting/alert-delivery.ts`
- `src/modules/alerting/telegram-alert-delivery.service.ts`

The active alert catalog and alerting conventions are documented in [`ALERTING.md`](../ALERTING.md).

#### `TelegramBotClientModule`

Responsibilities:

- owns the low-level Telegram Bot API HTTP client and its wire types
- configures the Telegram Bot API HTTP client with `BOT_TOKEN`
- exports `TelegramBotClient` to modules that need direct Bot API operations
- remains independent from higher-level Telegram workflows and application features

Main files:

- `src/modules/telegram/telegram-bot-client/telegram-bot-client.module.ts`
- `src/modules/telegram/telegram-bot-client/telegram-bot.client.ts`
- `src/modules/telegram/telegram-bot-client/types/`

#### `TelegramModule`

Responsibilities:

- owns higher-level Telegram workflows, composers, and authentication
- uses `TelegramBotClientModule` for low-level Telegram Bot API calls
- uses cache for Telegram-related operations
- can interact with bucket storage
- validates Web App `initData` and Telegram OIDC ID tokens, then exchanges them for application JWTs (with `AuthModule` services)
- imports `AuthModule` and `AdminModule` for token signing and admin checks; does **not** re-export `AuthModule` (consumers import `AuthModule` explicitly when they need JWT guards or services)

Main files:

- `src/modules/telegram/telegram.module.ts`
- `src/modules/telegram/telegram.service.ts`
- `src/modules/telegram/telegram-auth.controller.ts`

#### `AdminModule`

Responsibilities:

- admin UI HTTP API: dashboard, gig moderation, locale management, manual digest publish
- delegates to `AdminDashboardService`, `AdminGigService`, `GigModerationService`, `DigestService`, and `LocaleService`
- all routes use JWT cookies plus `AdminGuard`

Main files:

- `src/modules/admin/admin.module.ts`
- `src/modules/admin/admin.controller.ts`
- `src/modules/admin/admin-dashboard.service.ts`
- `src/modules/admin/admin-gig.service.ts`

#### `AuthModule`

Responsibilities:

- access and refresh JWT signing and verification
- HttpOnly cookie helpers for browser sessions
- `POST /v1/auth/refresh` and `POST /v1/auth/logout`
- guards: optional access JWT (`AccessJwtAuthGuard`), authenticated user required (`AuthenticatedUserGuard`)
- re-exports `AdminModule` so modules that only import `AuthModule` still receive admin checks where JWT services need them

Main files:

- `src/modules/auth/auth.module.ts`
- `src/modules/auth/access-jwt.service.ts`
- `src/modules/auth/refresh-jwt.service.ts`
- `src/modules/auth/auth-cookies.service.ts`
- `src/modules/auth/auth.controller.ts`

Shared types and mappers used across auth and Telegram (for example `AccessTokenIdentityPayload`, `verifiedAccessTokenToUser`) live under `src/shared/types` and `src/shared/mappers`.

#### `CalendarModule`

Responsibilities:

- wraps Google Calendar-related logic

Main files:

- `src/modules/calendar/calendar.module.ts`
- `src/modules/calendar/calendar.service.ts`

#### `BucketModule`

Responsibilities:

- wraps S3-compatible storage for posters

Main files:

- `src/modules/bucket/bucket.module.ts`
- `src/modules/bucket/bucket.service.ts`

#### `AiModule`

Responsibilities:

- wraps the external AI lookup/enrichment integration

Main files:

- `src/modules/ai/ai.module.ts`
- `src/modules/ai/ai.service.ts`

## Request Flows

### Public read flow

Typical path:

1. request hits a controller such as `GigController`, `LocaleController`, or `CountriesController`
2. DTO/query validation runs through the global validation pipe
3. the controller maps the HTTP request into application parameters when the boundary differs
4. the application service reads through its repository and returns an application result
5. the controller maps that result into the versioned response DTO

For the Gig feed, both HTTP mappings are pure functions in
`src/modules/gig/gig-feed/gig-feed.mapper.ts`; `GigFeedService` does not depend
on versioned response DTOs.

Examples:

- `/v1/gigs`
- `/v1/gigs/dates`
- `/v1/gigs/around`
- `/v1/countries`
- `/v1/locales`
- `/v1/translations`

### Telegram update flow

Typical path:

1. request hits `TelegramUpdatesController`
2. the webhook guard validates the Telegram secret without triggering retries
3. `TelegramUpdatesService` routes messages and callback queries
4. downstream services perform authorization and Gig or GigCandidate actions

Endpoint:

- `/v1/telegram/updates`

## Persistence Model

MongoDB is the primary datastore. Schemas are declared close to their domains:

- gigs in `src/modules/gig/gig.schema.ts`
- admins in `src/shared/schemas/admin.schema.ts`
- locales and translations in `src/modules/locale/*.schema.ts`
- countries in `src/modules/location/country/country.schema.ts`
- localities in `src/modules/location/locality/locality.schema.ts`
- Places in `src/modules/location/place/place.schema.ts`
- Communities in `src/modules/community/community.schema.ts`

This keeps schema ownership aligned with the module that owns the use case.

## Cross-Cutting Concerns

- validation: global Nest `ValidationPipe` in `AppModule`
- error handling: global exception filter plus Telegram update-specific filters
- configuration: `@nestjs/config` with env-based loading
- API versioning: URI versioning, for example `/v1/gigs`
- uploads: multer memory storage in Gig and GigCandidate write flows, capped at 10 MB for poster images
- scheduling: enabled globally through `ScheduleModule.forRoot()`

## Architectural Boundaries

The codebase is organized around a few practical boundaries:

- public read API is mostly isolated in `GigModule`, `CommunityModule`, `LocationModule`, and `LocaleModule`
- inbound Telegram orchestration is isolated in `TelegramUpdatesModule`
- external systems are abstracted behind dedicated services instead of being called directly from controllers
- Mongo models are registered per module rather than globally

This keeps responsibilities local and makes it easier to extend the project without turning `AppModule` into a business-logic container.
