# Gigs Together API

NestJS API for the Gigs Together project. It serves public gig data, authenticated admin and receiver flows, Telegram-driven moderation, Google Calendar integration, poster storage, and AI-assisted gig lookup.

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
    gig/                   public gig API and gig lookup
    receiver/              Telegram/receiver-facing endpoints
    telegram/              Telegram integration
    auth/                  JWT session, HttpOnly cookies, auth and authorization services
    admin/                 admin dashboard, moderation, locale management
    calendar/              Google Calendar integration
    bucket/                S3-compatible poster storage
    ai/                    AI-assisted lookup
    location/              country/location endpoints
    locale/                supported locales (`Locale` collection, admin CRUD via `LocaleService`)
    translation/           static localized text (`Translation` collection, namespace/key records)
migrations/                MongoDB migration files
test/                      e2e test setup
docker-compose.yml         local MongoDB
.env.example               environment template
```

## Architecture

Detailed architecture notes live in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Prerequisites

Install the following before you start:

1. Node.js `22.22.3`
2. npm `11.17.0`
3. Docker Desktop or Docker Engine
4. Access to required external credentials if you need full integration testing:
   - Telegram bot token, Web Login Client ID, and webhook secret
   - MongoDB connection details
   - Google Calendar credentials
   - S3-compatible storage credentials
   - AI provider URL, key, and model

## Environment configuration

### How configuration is loaded

The Nest application loads env files in this order:

1. `.env.<NODE_ENV>`
2. `.env`

Examples:

- `npm run start:dev` sets `NODE_ENV=dev`, so the app reads `.env.dev` first and then `.env`
- `npm run start:prod` sets `NODE_ENV=prod`, so the app reads `.env.prod` first and then `.env`

Important: the migration config in `migrate.ts` uses `dotenv.config()` directly and therefore reads `.env` by default, not `.env.dev` or `.env.prod`. If you want migrations to work locally, either:

- put the required Mongo variables into `.env`, or
- export them in your shell before running `npm run migrate:up`

### Create your local env file

At minimum, local development usually needs:

- `MONGO_URI`
- `MONGO_DB`
- `MONGO_PORT`

Depending on which flows you want to exercise, you may also need:

- Telegram: `BOT_*`, channel IDs, URLs
- Auth/admin: `JWT_*`, cookie settings, `ADMIN_*`
- Google: `CALENDAR_ID`, `GOOGLE_AUTH_JSON`
- S3 storage: `S3_*`
- AI: `AI_URL`, `AI_API_KEY`, `AI_MODEL`
- Frontend integration: `APP_BASE_URL`, `FEED_REVALIDATE_SECRET`, `TRANSLATIONS_REVALIDATE_SECRET`
- CORS: `CORS_ORIGINS`

`APP_BASE_URL` is also used to build Telegram links to public gig permalinks (`/gigs/:publicId`) and admin gig pages (`/admin/gigs/:publicId`).

### Environment variables reference

Current variables defined in `.env.example`:

| Variable                                        | Required                                     | Purpose                                                                  |
| ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `PORT`                                          | Optional                                     | NestJS port. Defaults to `3000`.                                         |
| `BOT_ADMINS`                                    | Usually yes                                  | Telegram admin map used by bot workflows.                                |
| `ADMIN_CACHE_TTL_MS`                            | Optional                                     | TTL for cached admin lookups.                                            |
| `TRANSLATION_CACHE_TTL_MS`                      | Optional                                     | TTL for in-memory translation cache bulk refresh. Defaults to 1 hour.    |
| `LOCALE_ACTIVE_CACHE_TTL_MS`                    | Optional                                     | TTL for in-memory active locales cache refresh. Defaults to 1 hour.      |
| `BOT_TOKEN`                                     | For Telegram flows                           | Telegram bot token.                                                      |
| `TELEGRAM_OIDC_CLIENT_ID`                       | For browser auth                             | Telegram Login Client ID from BotFather > Bot Settings > Web Login.      |
| `TELEGRAM_INIT_DATA_MAX_AGE_SEC`                | Optional                                     | Max age for Telegram WebApp `auth_date`.                                 |
| `JWT_SECRET`                                    | Yes for auth flows                           | Access JWT signing secret.                                               |
| `JWT_REFRESH_SECRET`                            | Yes for auth flows                           | Refresh JWT signing secret. Must differ from `JWT_SECRET` in production. |
| `JWT_ACCESS_EXPIRES_IN_SEC`                     | Optional                                     | Access JWT and access-cookie TTL in seconds.                             |
| `JWT_REFRESH_EXPIRES_IN_SEC`                    | Optional                                     | Refresh JWT and refresh-cookie TTL in seconds.                           |
| `ACCESS_TOKEN_COOKIE_NAME`                      | Optional                                     | Access-token cookie name.                                                |
| `ACCESS_TOKEN_COOKIE_SECURE`                    | Optional                                     | Forces the `Secure` flag for the access cookie.                          |
| `ACCESS_TOKEN_COOKIE_SAMESITE`                  | Optional                                     | SameSite mode for the access cookie.                                     |
| `ACCESS_TOKEN_COOKIE_DOMAIN`                    | Optional                                     | Domain attribute for the access cookie.                                  |
| `REFRESH_TOKEN_COOKIE_NAME`                     | Optional                                     | Refresh-token cookie name.                                               |
| `REFRESH_TOKEN_COOKIE_SECURE`                   | Optional                                     | Forces the `Secure` flag for the refresh cookie.                         |
| `REFRESH_TOKEN_COOKIE_SAMESITE`                 | Optional                                     | SameSite mode for the refresh cookie.                                    |
| `REFRESH_TOKEN_COOKIE_DOMAIN`                   | Optional                                     | Domain attribute for the refresh cookie.                                 |
| `BOT_SECRET`                                    | For Telegram webhook flows                   | Shared secret for webhook protection.                                    |
| `MAIN_CHANNEL_ID`                               | For Telegram flows                           | Main Telegram channel id.                                                |
| `MODERATION_CHANNEL_ID`                         | For moderation flows                         | Moderation Telegram channel id.                                          |
| `DIRECT_MESSAGES_URL`                           | For Telegram UX                              | Link used in bot/admin flows.                                            |
| `SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS` | Optional                                     | Also sends submission feedback DM to admins when `true`.                 |
| `EDIT_GIG_URL`                                  | For edit flows                               | Frontend or app URL for editing gigs.                                    |
| `MONGO_URI`                                     | Yes                                          | MongoDB connection string.                                               |
| `MONGO_DB`                                      | Yes for Docker/local setup                   | MongoDB database name.                                                   |
| `MONGO_PORT`                                    | Yes for Docker/local setup                   | Local MongoDB port mapping.                                              |
| `CALENDAR_ID`                                   | Optional                                     | Google Calendar id.                                                      |
| `GOOGLE_AUTH_JSON`                              | Optional                                     | Base64-encoded or raw Google auth JSON.                                  |
| `S3_BUCKET`                                     | Optional                                     | Bucket name for poster storage.                                          |
| `S3_ENDPOINT`                                   | Optional                                     | S3-compatible endpoint, for example Cloudflare R2.                       |
| `S3_ACCESS_KEY_ID`                              | Optional                                     | Storage access key.                                                      |
| `S3_SECRET_ACCESS_KEY`                          | Optional                                     | Storage secret key.                                                      |
| `S3_POSTERS_PREFIX`                             | Optional                                     | Poster object prefix. Defaults to `gigs`.                                |
| `S3_PUBLIC_BASE_URL`                            | Optional but required for public bucket mode | Public URL base for uploaded posters.                                    |
| `CORS_ORIGINS`                                  | Optional                                     | CORS mode or comma-separated allowlist.                                  |
| `EXTERNAL_POSTER_URL_FALLBACK_ENABLED`          | Optional                                     | Enables fallback poster URL behavior.                                    |
| `DEFAULT_GIG_POSTER_URL`                        | Optional                                     | Default public poster URL for gigs without posters.                      |
| `AI_URL`                                        | Optional                                     | AI service base URL.                                                     |
| `AI_API_KEY`                                    | Optional                                     | AI service key.                                                          |
| `AI_MODEL`                                      | Optional                                     | AI model identifier.                                                     |
| `AI_LOOKUP_DEBUG`                               | Optional                                     | Enables extra lookup diagnostics.                                        |
| `AI_LOOKUP_DEV_STUB`                            | Optional                                     | Dev-only stub mode for `/v1/gig/lookup`.                                 |
| `AI_LOOKUP_DEV_STUB_KEYWORD`                    | Optional                                     | Dev-only keyword trigger for lookup stub mode.                           |
| `APP_BASE_URL`                                  | Optional                                     | Frontend base URL.                                                       |
| `FEED_REVALIDATE_SECRET`                        | Optional                                     | Secret for frontend feed revalidation.                                   |

### CORS behavior

`src/main.ts` supports the following `CORS_ORIGINS` modes:

- unset: reflects request origin and allows credentials
- `reflect` or `all`: reflects request origin and allows credentials
- `*`: allows all origins without credentials
- comma-separated origins: allows only those origins and enables credentials

## Installation

Install dependencies:

```bash
npm install
```

If you are onboarding from scratch, use this order:

1. Install Node.js and npm
2. Copy `.env.example` to `.env` and/or `.env.dev`
3. Start MongoDB with Docker
4. Install npm dependencies
5. Run the app in dev mode

## Running MongoDB locally

The repo includes a simple Docker Compose file for MongoDB.

Before starting it, make sure your env file contains:

- `MONGO_DB`
- `MONGO_PORT`

Start MongoDB:

```bash
docker-compose up -d
```

Stop MongoDB:

```bash
docker-compose down
```

Check running containers:

```bash
docker ps
```

Default connection shape expected by the app:

```text
mongodb://<HOST>:<PORT>/<DBNAME>
```

Example local value:

```text
MONGO_URI=mongodb://localhost:27017/gigs-together
```

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

Vitest runs tests through Vite. Vite’s default TypeScript transform is **esbuild**, which does **not** emit `emitDecoratorMetadata` / `design:paramtypes`. Nest relies on that metadata for ordinary **constructor injection** in `Test.createTestingModule({ providers: [...] })`, so without a different transform, DI in tests breaks in non-obvious ways.

This repo uses **`unplugin-swc`** so SWC compiles test code with explicit options:

- `jsc.parser.decorators` and `jsc.transform.legacyDecorator`
- `jsc.transform.decoratorMetadata` (emits the metadata Nest reads)

The same `jsc` shape is written in **`vitest.config.ts`** (passed into `swc.vite()`) and duplicated in **`.swcrc`** as the documented source of truth. With **`tsconfigFile: false`**, unplugin-swc does **not** infer decorator settings from `tsconfig.json`, so the explicit `jsc` block is required—do not assume `emitDecoratorMetadata` in `tsconfig.json` applies to the Vitest pipeline.

**`vitest.setup.ts`** imports **`reflect-metadata`**: that only provides the runtime API to _read_ metadata SWC already emitted; it does not _generate_ metadata.

A small guard test lives in **`src/nest-di-metadata.spec.ts`** (constructor-only dependency, no `@Inject()`). If you turn off `decoratorMetadata` in the SWC config, that test should fail.

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

Apply pending migrations with:

```bash
npm run migrate:up
```

Dry-run pending migrations with:

```bash
npm run migrate:up:dry
```

Migration files live in `migrations/`.

The dry-run flow is opt-in inside each migration. `npm run migrate:up:dry` only sets `DRY_RUN=true`; a migration must check `isMigrationDryRun()` and call `finishMigrationDryRun()` to avoid being marked as applied.

Because `migrate.ts` reads `.env` by default, verify that `MONGO_URI` is available there before running migrations.

## API notes for contributors

- API versioning is URI-based, so versioned routes look like `/v1/gig`, `/v1/location/countries`, `/v1/locale`, and `/v1/locale/translations`
- request validation is enabled globally with Nest `ValidationPipe`
- MongoDB is connected through `MongooseModule.forRootAsync`
- auth is cookie-based and uses access + refresh JWTs in HttpOnly cookies
- uploads for receiver gig posters use in-memory multer storage with a 10 MB limit
- receiver create/update gig endpoints and `/v1/gig/lookup` are admin-protected
- admin moderation exposes `POST /v1/admin/gig/:publicId/approve`, `POST /v1/admin/gig/:publicId/reject`, and `POST /v1/admin/gig/:publicId/post`
- manual weekly digest publish is available at `POST /v1/admin/digest/publish` (admin JWT + `AdminGuard`; calls `DigestService.publish()` directly)
- approving a gig moves it to `Published`, revalidates the feed, updates moderation/feedback posts, and creates the calendar event; posting to the main channel happens in the separate `.../post` step
- translation writes revalidate API cache and front Next.js cache via `TranslationRevalidateService` when `APP_BASE_URL` and `TRANSLATIONS_REVALIDATE_SECRET` are configured
- `GET /health` is the simplest endpoint to use for smoke testing

### Locale and translations modules

Locale metadata and translation strings are split into two Nest modules. Both expose routes under the `/v1/locale` prefix, but they own different collections and responsibilities.

| Module              | Path                       | MongoDB model | Responsibility                                                     |
| ------------------- | -------------------------- | ------------- | ------------------------------------------------------------------ |
| `LocaleModule`      | `src/modules/locale/`      | `Locale`      | Supported locale records: `iso`, `nativeName`, `isActive`, `order` |
| `TranslationModule` | `src/modules/translation/` | `Translation` | Text and templates keyed by `locale`, `namespace`, and `key`       |

Public endpoints:

- `GET /v1/locale` — active locales sorted for clients (from `LocaleModule`)
- `GET /v1/locale/translations` — grouped translation payloads; resolves locale from `Accept-Language` and optional `?namespaces=` filter (from `TranslationModule`)

Admin locale management lives in `AdminModule`, which imports `LocaleModule` and reuses `LocaleService`:

- `GET /v1/admin/locales`
- `PATCH /v1/admin/locales/:iso`
- `PATCH /v1/admin/locales/order`

`TranslationModule` registers the `Locale` schema only to validate supported locale codes when serving translations; locale CRUD stays in `LocaleModule`.

More module-level detail is in [ARCHITECTURE.md](./ARCHITECTURE.md).

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
