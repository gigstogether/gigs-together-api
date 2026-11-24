# Gigs Together API

NestJS API for the Gigs Together project. It serves public gig data, authenticated admin and receiver flows,
Telegram-driven moderation, Google Calendar integration, poster storage, and AI-assisted gig lookup.

## What this project does

The API currently provides:

- public REST endpoints for gigs, locations, supported locales, and translations
- cookie-based auth endpoints for the admin and receiver clients
- admin endpoints for dashboard, gig moderation, locale management, and digest publish
- Telegram webhook handling for admin/moderation flows
- gig creation and editing endpoints for the receiver client
- MongoDB persistence through Mongoose
- Google Calendar integration
- S3-compatible poster storage
- AI lookup for gig enrichment

Main entry points:

- `GET /` returns a simple service payload
- `GET /health` returns health status
- versioned API routes are exposed under `/v1/...`
- unversioned routes are limited to `GET /` and `GET /health`

## Tech stack

### Runtime and package manager

- Node.js: `22.22.3`
- npm: `11.17.0`
- package lock format: `lockfileVersion 3`

### Infrastructure

- MongoDB Docker image: `mongodb/mongodb-community-server`

## Repository layout

```text
src/
  main.ts                  Nest bootstrap
  app.module.ts            root module and environment loading
  modules/
    gig/                   gig persistence, public API, and Gig feed ownership
      gig-feed/            Gig feed queries, response mapping, and frontend cache revalidation
      gig-poster/          Gig poster validation, download, and storage
    gig-candidate/         submission and moderation workflow
      gig-candidate-approval/  candidate-to-Gig approval transaction and persistence mapping
      gig-candidate-poster/    candidate poster selection and defaulting
    telegram-updates/      inbound Telegram webhook update handling
    telegram/              Telegram Bot API client, outbound messaging, and message composition
    alerting/              actionable internal alerts and delivery adapters
    auth/                  JWT session, HttpOnly cookies, auth and authorization services
    admin/                 admin dashboard, moderation, locale management
    calendar/              Google Calendar integration
    bucket/                S3-compatible poster storage
    ai/                    AI-assisted lookup
    location/              country/location endpoints
    locale/                supported locales (`Locale` collection, admin CRUD via `LocaleService`)
    translation/           static localized text (`Translation` collection, namespace/key records)
migrations/                MongoDB migration files
docs/                      architecture and operational documentation
test/                      e2e test setup
docker-compose.yml         local MongoDB
.env.example               environment template
```

## Architecture

Detailed architecture notes live in [docs/architecture](./docs/architecture/README.md). The active internal alert
catalog and alerting conventions live in [docs/monitoring/ALERTING.md](./docs/monitoring/ALERTING.md).

## Prerequisites

Install and configure the following before you start:

1. Node.js `22.22.3`
2. npm `11.17.0`
3. Docker Desktop or Docker Engine if using the bundled local MongoDB
4. MongoDB access, a Telegram bot token, Web Login Client ID, webhook secret, and JWT signing secrets for application
   startup
5. Google Calendar, S3-compatible storage, and AI provider credentials for the integrations you intend to use

## Environment configuration

Copy [`.env.example`](./.env.example) to `.env` in the repository root and configure the startup requirements before
running the API.

See the [environment reference](./docs/configuration/ENVIRONMENT.md) for required settings, defaults, and file-loading
rules. For backend bot, channel, and webhook configuration, see
[Telegram integration — backend setup](./docs/integrations/TELEGRAM.md#backend-setup).

## Installation

Install dependencies:

```bash
npm install
```

If you are onboarding from scratch, use this order:

1. Install Node.js and npm
2. Copy `.env.example` to `.env` and complete the
   [environment setup](./docs/configuration/ENVIRONMENT.md#required-at-application-startup)
3. Start MongoDB with Docker
4. Install npm dependencies
5. Run the app in dev mode

## Running MongoDB locally

For local development only, the repo includes a Docker Compose file that runs MongoDB as a single-member replica set
named `rs0`. This supports local multi-document transactions while keeping one MongoDB container. The container
healthcheck initializes the replica set once and waits until its member becomes writable.

Configure the [Docker-only variables](./docs/configuration/ENVIRONMENT.md#docker-only-local-development-settings) in
`.env` and match `MONGO_URI` to the local connection example below.

Start MongoDB:

```bash
docker-compose up -d
```

Before recreating an existing standalone container, create a local backup. MongoDB data and configuration are stored in
the named `gigs-together-mongodb-data` and `gigs-together-mongodb-config` volumes, so a regular `docker-compose down`
followed by `docker-compose up -d` preserves the database. Do not use `docker-compose down -v`, because `-v` removes
those named volumes and their data.

Stop MongoDB:

```bash
docker-compose down
```

Check running containers:

```bash
docker ps
```

Local connection example:

```env
MONGO_URI=mongodb://localhost:27017/gigs-together?replicaSet=rs0&directConnection=true
```

Change it when using a different host port or database. `directConnection=true` is for the bundled single-member local
replica set, where only one endpoint is exposed to the host. Do not add it to Atlas replica-set or sharded-cluster
connection strings.

Verify the local topology after startup:

```bash
docker exec mongodb-gigs mongosh --quiet --eval "const hello = db.adminCommand({ hello: 1 }); printjson({ setName: hello.setName, isWritablePrimary: hello.isWritablePrimary })"
```

The expected result contains `setName: 'rs0'` and `isWritablePrimary: true`.

## Running the application

### Development mode

```bash
npm run start:dev
```

This runs Nest in watch mode with `NODE_ENV=dev`.

### Debug mode

```bash
npm run start:debug
```

### Production-like local run

Build first:

```bash
npm run build
```

Then start the compiled app:

```bash
npm run start
```

Or with production env selection:

```bash
npm run start:prod
```

### Base URL

When the app is running locally, it listens on:

```text
http://localhost:3000
```

Unless `PORT` is set to a different value.

Quick checks:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
```

## Local HTTPS access with Cloudflare Tunnel

This tunnel provides public HTTPS access to the local API, including Telegram bot webhook handling.

To start an already configured tunnel, use the name chosen during creation:

```text
cloudflared tunnel run <tunnel-name>
```

See the [Cloudflare Tunnel development guide](./docs/development/CLOUDFLARE_TUNNEL.md) for installation, tunnel
creation, local configuration, and usage.

## Build, lint, format, and test

### Build

```bash
npm run build
```

Compiled output goes to `dist/`.

### Lint

```bash
npm run lint:fix
```

### Format

```bash
npm run format:write
```

### Lint and format in one step

```bash
npm run lint:format:fix
```

### Unit tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Coverage:

```bash
npm run test:cov
```

Debug:

```bash
npm run test:debug
```

#### Why Vitest uses SWC (`unplugin-swc`)

Vitest runs tests through Vite. Vite’s default TypeScript transform is **esbuild**, which does **not** emit
`emitDecoratorMetadata` / `design:paramtypes`. Nest relies on that metadata for ordinary **constructor injection** in
`Test.createTestingModule({ providers: [...] })`, so without a different transform, DI in tests breaks in non-obvious
ways.

This repo uses **`unplugin-swc`** so SWC compiles test code with explicit options:

- `jsc.parser.decorators` and `jsc.transform.legacyDecorator`
- `jsc.transform.decoratorMetadata` (emits the metadata Nest reads)

The same `jsc` shape is written in **`vitest.config.ts`** (passed into `swc.vite()`) and duplicated in **`.swcrc`** as
the documented source of truth. With **`tsconfigFile: false`**, unplugin-swc does **not** infer decorator settings from
`tsconfig.json`, so the explicit `jsc` block is required—do not assume `emitDecoratorMetadata` in `tsconfig.json`
applies to the Vitest pipeline.

**`vitest.setup.ts`** imports **`reflect-metadata`**: that only provides the runtime API to _read_ metadata SWC already
emitted; it does not _generate_ metadata.

A small guard test lives in **`src/nest-di-metadata.spec.ts`** (constructor-only dependency, no `@Inject()`). If you
turn off `decoratorMetadata` in the SWC config, that test should fail.

### End-to-end tests

```bash
npm run test:e2e
```

## NestJS CLI

The project uses Nest CLI and keeps source code under `src/`.

Check the CLI version:

```bash
npx nest --version
```

### Generate a module

To generate a new module:

```bash
npx nest generate module modules/<name>
```

Example:

```bash
npx nest generate module modules/example
```

This creates:

```text
src/modules/example/example.module.ts
```

### Generate a controller or service inside a module

Controller:

```bash
npx nest generate controller modules/<name>
```

Service:

```bash
npx nest generate service modules/<name>
```

Examples:

```bash
npx nest generate controller modules/example
npx nest generate service modules/example
```

### Generate a full resource

If you want Nest to scaffold a resource in one go:

```bash
npx nest generate resource modules/<name>
```

This is useful for quick scaffolding, but in this repository you will usually still need to adjust:

- Mongoose schemas
- DTOs and request types
- module imports/exports
- integration wiring with Telegram, Calendar, Bucket, or AI services

### Short aliases

Nest CLI also supports aliases:

```bash
npx nest g mo modules/example
npx nest g co modules/example
npx nest g s modules/example
```

### Recommendation for this repo

When adding a new feature area, keep it under `src/modules/<feature>`.

Typical sequence:

```bash
npx nest g mo modules/example
npx nest g co modules/example
npx nest g s modules/example
```

## Database migrations

List migration states with:

```bash
npm run migrate:list
```

Dry-run pending migrations (the default) with:

```bash
npm run migrate:up
```

Dry-run one migration by name with:

```bash
npm run migrate:up:single:dry -- example-migration
```

Apply one migration by name only after reviewing its dry-run report with:

```bash
npm run migrate:up:single:apply -- example-migration
```

The single-migration scripts embed `--single` before the forwarded migration name. Do not append `--single` after
`npm run ... --`; current npm versions may interpret it as npm configuration instead of forwarding it to the migrator.

Use the migration name without the numeric filename timestamp. For example, `1234567890000-example-migration.ts` is run
as `example-migration`.

Migration files and their unit tests live in `migrations/`. Only actual migrations start with a numeric timestamp;
colocated `*.test.ts` files must not.

Dry run is the default. `npm run migrate:up:apply` explicitly sets `DRY_RUN=false`; every migration must check
`isMigrationDryRun()` and call `finishMigrationDryRun()` so a dry run is not marked as applied.

A successful dry run currently ends with `MigrationDryRunCompleteError`. This is the expected completion signal that
keeps the migration in the pending state; review the JSON report printed immediately before it.

Because `migrate.ts` reads `.env` by default, verify that `MONGO_URI` is available there before running migrations.

## API notes for contributors

- API versioning is URI-based, so versioned routes look like `/v1/gigs`, `/v1/countries`, `/v1/locales`, and
  `/v1/translations`
- request validation is enabled globally with Nest `ValidationPipe`
- MongoDB is connected through `MongooseModule.forRootAsync`
- auth is cookie-based and uses access + refresh JWTs in HttpOnly cookies
- uploads for receiver gig posters use in-memory multer storage with a 10 MB limit
- GigCandidate submission is available at `POST /v1/gig-candidates`; admin creation, lookup, editing, and moderation
  actions are under `/v1/admin/gig-candidates`
- admin Gig editing, visibility, and main-post actions are under `/v1/admin/gigs/:publicId`
- manual weekly digest publish is available at `POST /v1/admin/digest/publish` (admin JWT + `AdminGuard`; calls
  `DigestService.publish()` directly)
- approving a Reviewing GigCandidate atomically creates a visible Gig, then best-effort revalidates the Gig feed,
  creates the calendar event, updates the moderation post, and sends lifecycle feedback; posting to the main channel
  remains a separate Gig action
- translation writes revalidate API cache and front Next.js cache via `TranslationRevalidateService` when `APP_BASE_URL`
  and `TRANSLATIONS_REVALIDATE_SECRET` are configured
- `GET /health` is the simplest endpoint to use for smoke testing

### Locale and translations modules

Locale metadata and translation strings are split into two Nest modules with independent resource routes and
collections.

| Module              | Path                       | MongoDB model | Responsibility                                                     |
| ------------------- | -------------------------- | ------------- | ------------------------------------------------------------------ |
| `LocaleModule`      | `src/modules/locale/`      | `Locale`      | Supported locale records: `iso`, `nativeName`, `isActive`, `order` |
| `TranslationModule` | `src/modules/translation/` | `Translation` | Text and templates keyed by `locale`, `namespace`, and `key`       |

Public endpoints:

- `GET /v1/locales` — active locales sorted for clients (from `LocaleModule`)
- `GET /v1/translations` — grouped translation payloads; resolves locale from `Accept-Language` and optional
  `?namespaces=` filter (from `TranslationModule`)

Admin locale management lives in `AdminModule`, which imports `LocaleModule` and reuses `LocaleService`:

- `GET /v1/admin/locales`
- `PATCH /v1/admin/locales/:iso`
- `PATCH /v1/admin/locales/order`

`TranslationModule` registers the `Locale` schema only to validate supported locale codes when serving translations;
locale CRUD stays in `LocaleModule`.

More module-level detail is in [docs/architecture](./docs/architecture/README.md).

## Common development workflow

```bash
docker-compose up -d
npm install
npm run start:dev
```

In a second terminal:

```bash
npm test
```

Before opening a PR:

```bash
npm run lint:format:fix
npm run build
npm test
```

## Git hooks and commit rules

The repo uses Husky:

- `pre-commit` runs `npx --no-install lint-staged`
- `commit-msg` runs `npx --no -- commitlint --edit $1`

`lint-staged` currently does:

- for `*.{js,ts}`: Prettier write + ESLint fix
- for `*.{json,md,yml,yaml}`: Prettier write

Commit messages are validated against the Conventional Commits config from `@commitlint/config-conventional`.

Example valid commits:

- `feat: add city filter to feed`
- `fix: handle missing Telegram link`
- `docs: expand local setup instructions`

## CI and branch automation

The repository currently includes one GitHub Actions workflow:

- on push to `main`, GitHub Actions automatically merges `main` into `stg`

There is no general CI workflow for linting, tests, or builds in this repository at the moment.

## Known caveats

- `README.md` assumes npm as the package manager because the repository contains `package-lock.json`
- the MongoDB Docker image is not pinned
- some project flows depend on external services and cannot be exercised fully with MongoDB alone
- migration env loading differs from application env loading

## License

This repository is marked `UNLICENSED` in `package.json`.
