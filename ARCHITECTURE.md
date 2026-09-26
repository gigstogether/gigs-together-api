# Architecture

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
- exposes `GigService`
- contains `GigPosterService` for poster handling

Dependencies:

- `AiModule`
- `CalendarModule`
- `BucketModule`
- `AuthModule`
- `TelegramModule`
- local `Gig` Mongoose model

Main files:

- `src/modules/gig/gig.module.ts`
- `src/modules/gig/gig.controller.ts`
- `src/modules/gig/gig.service.ts`
- `src/modules/gig/gig.schema.ts`

#### `TelegramUpdatesModule`

Responsibilities:

- receives authenticated Telegram webhook updates
- routes bot messages and callback queries
- coordinates Telegram-triggered Gig and GigCandidate actions
- keeps inbound update orchestration separate from the foundational `TelegramModule`

Dependencies:

- `GigModule`
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

#### `LocationModule`

Responsibilities:

- serves country/location data

Persistence:

- `Country`
- `locale`

Main files:

- `src/modules/location/location.module.ts`
- `src/modules/location/location.controller.ts`
- `src/modules/location/location.service.ts`

### Integration and infrastructure modules

#### `TelegramModule`

Responsibilities:

- wraps Telegram Bot API calls
- configures an HTTP client with `BOT_TOKEN`
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

1. request hits a controller such as `GigController`, `localeController`, or `LocationController`
2. DTO/query validation runs through the global validation pipe
3. the controller delegates to a domain service
4. the service reads from MongoDB and returns a response DTO

Examples:

- `/v1/gig`
- `/v1/gig/dates`
- `/v1/gig/around`
- `/v1/location/countries`
- `/v1/locale`
- `/v1/locale/translations`

### Telegram update flow

Typical path:

1. request hits `TelegramUpdatesController`
2. the webhook guard validates the Telegram secret without triggering retries
3. `TelegramUpdatesService` routes messages and callback queries
4. downstream services perform authorization and Gig or GigCandidate actions

Current endpoint:

- `/v1/receiver/webhook`

The route remains for backward compatibility with the registered Telegram webhook and should eventually migrate to `/v1/telegram/updates`.

## Persistence Model

MongoDB is the primary datastore. Schemas are declared close to their domains:

- gigs in `src/modules/gig/gig.schema.ts`
- admins in `src/shared/schemas/admin.schema.ts`
- locales and translations in `src/modules/locale/*.schema.ts`
- locations in `src/modules/location/location.schema.ts`

This keeps schema ownership aligned with the module that owns the use case.

## Cross-Cutting Concerns

- validation: global Nest `ValidationPipe` in `AppModule`
- error handling: global exception filter plus Telegram update-specific filters
- configuration: `@nestjs/config` with env-based loading
- API versioning: URI versioning, for example `/v1/gig`
- uploads: multer memory storage in Gig and GigCandidate write flows, capped at 10 MB for poster images
- scheduling: enabled globally through `ScheduleModule.forRoot()`

## Architectural Boundaries

The codebase is organized around a few practical boundaries:

- public read API is mostly isolated in `GigModule`, `LocationModule`, and `LocaleModule`
- inbound Telegram orchestration is isolated in `TelegramUpdatesModule`
- external systems are abstracted behind dedicated services instead of being called directly from controllers
- Mongo models are registered per module rather than globally

This keeps responsibilities local and makes it easier to extend the project without turning `AppModule` into a business-logic container.
