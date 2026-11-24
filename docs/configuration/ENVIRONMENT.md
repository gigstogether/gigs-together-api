# Backend environment configuration

Copy [`.env.example`](../../.env.example) to `.env`. Fill in all startup settings and the integrations you use.

## Loading configuration

Priority: process environment → `.env.<NODE_ENV>` → `.env`. Set `NODE_ENV` in the launch command or deployment before
Nest starts.

`start:dev` selects `.env.dev`; `start:prod` selects `.env.prod`. Without `NODE_ENV`, file selection defaults to `dev`.
The standard value `production` selects `.env.production`. Cookies and the AI stub recognize both `production` and the
legacy `prod` alias.

Migrations and local Docker Compose read `.env` independently; they do not automatically select Nest's
environment-specific files.

## Value formats

- Strings are trimmed; blank optional values use the default or remain unset. Required values reject blanks.
- Booleans accept `true/false`, `1/0`, `yes/no`, or `on/off`, ignoring case; other values reject initialization.
- Durations, ports, and OIDC Client IDs must be positive safe integers. `MAIN_CHAT_ID` / `MAIN_CHANNEL_ID` accept
  non-zero safe integers, including negatives.
- Cookie SameSite accepts `lax`, `strict`, or `none`. Browsers require `Secure` for `none`.

## Required at application startup

These have no runtime defaults, including when only public API endpoints are used. Mini App names in the template must
match BotFather.

| Variable                               | Required | Purpose                                                                                   |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `MONGO_URI`                            | Yes      | MongoDB connection string, including the database; also used by migrations.               |
| `JWT_SECRET`                           | Yes      | Access JWT signing secret.                                                                |
| `JWT_REFRESH_SECRET`                   | Yes      | Refresh JWT signing secret; use a different secret in production.                         |
| `BOT_TOKEN`                            | Yes      | Telegram bot token and Mini App initData validation.                                      |
| `BOT_SECRET`                           | Yes      | Must match the webhook's `secret_token`.                                                  |
| `MAIN_CHAT_ID`                         | Yes      | Group/supergroup accepting `/gig` commands.                                               |
| `MAIN_CHANNEL_ID`                      | Yes      | Main channel for gig posts.                                                               |
| `ALERTS_TELEGRAM_CHANNEL_ID`           | Yes      | Internal alerts channel.                                                                  |
| `TELEGRAM_OIDC_CLIENT_ID`              | Yes      | BotFather Web Login Client ID; must match frontend `NEXT_PUBLIC_TELEGRAM_OIDC_CLIENT_ID`. |
| `TELEGRAM_SUGGEST_MINI_APP_SHORT_NAME` | Yes      | Suggestion Direct Mini App short name; template value `suggest`.                          |
| `TELEGRAM_ADMIN_MINI_APP_SHORT_NAME`   | Yes      | Admin Direct Mini App short name; template value `admin`.                                 |

## Optional application settings

| Variable                                        | Required | Default                                 | Purpose / units                                                                                                                |
| ----------------------------------------------- | -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                      | No       | File selection: `dev`                   | Set by launch command/deployment, not in the template; see loading rules above.                                                |
| `PORT`                                          | No       | `3000`                                  | HTTP port.                                                                                                                     |
| `ADMIN_CACHE_TTL_MS`                            | No       | `3600000` (1 hour)                      | Admin lookup cache TTL, milliseconds.                                                                                          |
| `TRANSLATION_CACHE_TTL_MS`                      | No       | `3600000` (1 hour)                      | Translation cache bulk refresh interval, milliseconds.                                                                         |
| `LOCALE_ACTIVE_CACHE_TTL_MS`                    | No       | `3600000` (1 hour)                      | Active locale cache refresh interval, milliseconds.                                                                            |
| `JWT_ACCESS_EXPIRES_IN_SEC`                     | No       | `3600` (1 hour)                         | Access JWT and cookie lifetime, seconds.                                                                                       |
| `JWT_REFRESH_EXPIRES_IN_SEC`                    | No       | `2592000` (30 days)                     | Refresh JWT and cookie lifetime, seconds.                                                                                      |
| `ACCESS_TOKEN_COOKIE_NAME`                      | No       | `gt_access`                             | HttpOnly access cookie name.                                                                                                   |
| `ACCESS_TOKEN_COOKIE_SECURE`                    | No       | `true` in production, otherwise `false` | Access cookie Secure flag; explicit values override the default.                                                               |
| `ACCESS_TOKEN_COOKIE_SAMESITE`                  | No       | `lax`                                   | Access cookie SameSite policy.                                                                                                 |
| `ACCESS_TOKEN_COOKIE_DOMAIN`                    | No       | Host-only                               | Access cookie domain, e.g. `.example.com`.                                                                                     |
| `REFRESH_TOKEN_COOKIE_NAME`                     | No       | `gt_refresh`                            | HttpOnly refresh cookie name.                                                                                                  |
| `REFRESH_TOKEN_COOKIE_SECURE`                   | No       | `true` in production, otherwise `false` | Refresh cookie Secure flag; explicit values override the default.                                                              |
| `REFRESH_TOKEN_COOKIE_SAMESITE`                 | No       | `lax`                                   | Refresh cookie SameSite policy.                                                                                                |
| `REFRESH_TOKEN_COOKIE_DOMAIN`                   | No       | Host-only                               | Refresh cookie domain.                                                                                                         |
| `TELEGRAM_INIT_DATA_MAX_AGE_SEC`                | No       | `86400` (24 hours)                      | Maximum initData age / replay window, seconds.                                                                                 |
| `SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS` | No       | `false`                                 | Also send submission feedback DMs to admins.                                                                                   |
| `CORS_ORIGINS`                                  | No       | Reflect origin, allow credentials       | `reflect` / `all`: same behavior; `*`: all origins without credentials; comma-separated origins: credential-enabled allowlist. |
| `EXTERNAL_POSTER_URL_FALLBACK_ENABLED`          | No       | `true`                                  | Allow external poster URLs when a bucket public URL is unavailable.                                                            |

## Integration settings

A dash in the Default column means no default.

| Variable                         | Required                                       | Default | Purpose                                                                                             |
| -------------------------------- | ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `INTAKE_CHANNEL_ID`              | For intake posts                               | —       | Channel for new raw submissions.                                                                    |
| `MODERATION_CHANNEL_ID`          | For moderation posts                           | —       | Channel for candidates under review.                                                                |
| `CALENDAR_ID`                    | For Calendar                                   | —       | Target Google Calendar, shared with the service account.                                            |
| `GOOGLE_APPLICATION_CREDENTIALS` | One credential source for Calendar             | —       | Path to service account JSON; alternative to `GOOGLE_AUTH_JSON`.                                    |
| `GOOGLE_AUTH_JSON`               | One credential source for Calendar             | —       | Raw or base64 service account JSON; alternative to the credentials path.                            |
| `S3_BUCKET`                      | For poster uploads                             | —       | Destination bucket for poster uploads.                                                              |
| `S3_ENDPOINT`                    | For R2/custom endpoints                        | —       | Custom provider endpoint; R2: `https://<accountid>.r2.cloudflarestorage.com`.                       |
| `S3_ACCESS_KEY_ID`               | Unless SDK supplies credentials; pair required | —       | Storage credential; configure together with `S3_SECRET_ACCESS_KEY`.                                 |
| `S3_SECRET_ACCESS_KEY`           | Unless SDK supplies credentials; pair required | —       | Storage credential; configure together with `S3_ACCESS_KEY_ID`.                                     |
| `S3_REGION`                      | No; provider-specific override                 | `auto`  | Provider region; default suits R2.                                                                  |
| `S3_FORCE_PATH_STYLE`            | No                                             | `false` | Enable path-style addressing if the provider requires it.                                           |
| `S3_POSTERS_PREFIX`              | No                                             | `gigs`  | Poster object prefix; no `..` or backslashes.                                                       |
| `S3_PUBLIC_BASE_URL`             | For public poster URLs                         | —       | Public bucket/CDN/custom-domain URL for stored posters.                                             |
| `DEFAULT_GIG_POSTER_URL`         | When a default poster is needed                | —       | Direct public image URL for submissions requiring a default poster.                                 |
| `AI_URL`                         | For real AI lookup                             | —       | OpenAI-compatible API base URL.                                                                     |
| `AI_API_KEY`                     | For real AI lookup                             | —       | AI provider credential.                                                                             |
| `AI_MODEL`                       | For real AI lookup                             | —       | AI model identifier.                                                                                |
| `AI_LOOKUP_DEBUG`                | No                                             | `false` | Extra lookup diagnostics.                                                                           |
| `AI_LOOKUP_DEV_STUB`             | No                                             | `false` | Stub for `POST /v1/admin/gig-candidates/lookup`; ignored in production.                             |
| `AI_LOOKUP_DEV_STUB_KEYWORD`     | No                                             | —       | Case-insensitive name/location trigger, independent of the flag; ignored in production.             |
| `APP_BASE_URL`                   | For frontend links/revalidation                | —       | Frontend base URL for Telegram links and revalidation; matches frontend `NEXT_PUBLIC_APP_BASE_URL`. |
| `FEED_REVALIDATE_SECRET`         | For feed revalidation                          | —       | Must match frontend value; requires `APP_BASE_URL`.                                                 |
| `TRANSLATIONS_REVALIDATE_SECRET` | For translation revalidation                   | —       | Must match frontend value; requires `APP_BASE_URL`.                                                 |

- Calendar needs `CALENDAR_ID` and exactly one credential source. Missing/invalid configuration disables the integration
  and reports an alert; the API keeps running. See [Google setup](#google-calendar-credentials).
- R2 public storage needs the bucket, endpoint, credential pair, and public base URL. A partial credential pair prevents
  startup; when both credentials are absent, the AWS SDK credential chain is used.
- Real AI lookup needs the URL, key, and model. See [Telegram setup](#required-telegram-setup) for BotFather and channel
  configuration.

## Docker-only local development settings

Only the bundled local Compose setup reads these values. The API and migrations use `MONGO_URI`; its database and host
port must match.

| Variable     | Required                 | Template value  | Purpose                                     |
| ------------ | ------------------------ | --------------- | ------------------------------------------- |
| `MONGO_DB`   | For local Docker Compose | `gigs-together` | Container `MONGO_INITDB_DATABASE`.          |
| `MONGO_PORT` | For local Docker Compose | `27017`         | Host port mapped to container port `27017`. |

See [Running MongoDB locally](../../README.md#running-mongodb-locally) for the replica-set URI and startup commands.

## Google Calendar credentials

Configure `CALENDAR_ID` and exactly one service account credential source. Missing credentials, multiple sources,
invalid JSON, or a credential `type` other than `service_account` make the integration unavailable. The provider reports
a configuration failure through alerting while the application continues running; operations that need Calendar can then
fail. These are integration requirements, not unconditional startup requirements.

For local development, keep the service account file outside version control and configure its path:

```env
CALENDAR_ID=<google-calendar-id>
GOOGLE_APPLICATION_CREDENTIALS=./google-auth.json
GOOGLE_AUTH_JSON=
```

`google-auth.json` is ignored by Git. The application reads this file but never creates or modifies it.

For production environments that provide secrets through environment variables, configure raw or base64-encoded service
account JSON:

```env
CALENDAR_ID=<google-calendar-id>
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_AUTH_JSON=<raw-or-base64-encoded-service-account-json>
```

The provider validates the JSON and constructs a JWT service account auth client in memory without writing credentials
to disk. Share the target Google Calendar with the service account's `client_email`, granting permission to create
events.

## Required Telegram setup

The GigCandidate workflow requires one Telegram bot per environment with the following BotFather and channel
configuration:

1. Create two named Mini App direct links for the same bot:
   - the short name configured in `TELEGRAM_SUGGEST_MINI_APP_SHORT_NAME` uses frontend URL
     `https://<frontend-host>/suggest/launch` and opens the universal suggestion entry point;
   - the short name configured in `TELEGRAM_ADMIN_MINI_APP_SHORT_NAME` uses frontend URL
     `https://<frontend-host>/admin/telegram` and dispatches Gig and GigCandidate admin actions from moderation posts.
2. Keep Same-Origin Restriction enabled for the Mini Apps. Main App and Menu Button are optional entry points;
   backend-generated edit links do not depend on them.
3. Configure Web Login in BotFather for the frontend origin. Use the same Client ID in backend `TELEGRAM_OIDC_CLIENT_ID`
   and frontend `NEXT_PUBLIC_TELEGRAM_OIDC_CLIENT_ID`.
4. Add the bot as an administrator to the Intake, Moderation, and Main channels, with permission to publish and edit
   posts. Set their numeric IDs in `INTAKE_CHANNEL_ID`, `MODERATION_CHANNEL_ID`, and `MAIN_CHANNEL_ID`.
5. Register `https://<api-host>/v1/telegram/updates` through Telegram `setWebhook`, passing the backend `BOT_SECRET` as
   `secret_token`. `getWebhookInfo` must report that exact URL and no configuration error.
6. Set `TELEGRAM_SUGGEST_MINI_APP_SHORT_NAME` to the BotFather short name for the suggestion Direct Mini App.
   Shared-chat suggestion buttons use the resulting direct link; private-chat buttons use `APP_BASE_URL/suggest/launch`
   as a `web_app` button.
7. Set `TELEGRAM_ADMIN_MINI_APP_SHORT_NAME` to the BotFather short name for the admin Direct Mini App. The backend
   obtains the bot username through `getMe` and appends the typed `startapp` action and identifier.

The backend validates that both short-name variables are non-empty, but it cannot verify through the HTTP Bot API that
the corresponding Direct Mini Apps exist or belong to the bot. Telegram exposes [
`messages.getBotApp`](https://core.telegram.org/method/messages.getBotApp) for this purpose only through the user-only
MTProto API. After configuring an environment, verify both generated `https://t.me/<bot_username>/<short_name>` links in
a Telegram client. A misspelled or missing BotFather short name is otherwise detected only when a user opens the link.

The `startapp` contract is shared by the backend URL composer and the frontend launch parser:

| Action enum member                         | Wire value         | Identifier      | Resulting admin route                        |
| ------------------------------------------ | ------------------ | --------------- | -------------------------------------------- |
| `AdminMiniAppStartAction.EditGig`          | `editGig`          | Gig `publicId`  | `/admin/gigs/:publicId/edit`                 |
| `AdminMiniAppStartAction.EditGigCandidate` | `editGigCandidate` | GigCandidate ID | `/admin/gig-candidates/:gigCandidateId/edit` |
| `AdminMiniAppStartAction.OpenGig`          | `openGig`          | Gig `publicId`  | `/admin/gigs/:publicId`                      |
| `AdminMiniAppStartAction.OpenGigCandidate` | `openGigCandidate` | GigCandidate ID | `/admin/gig-candidates/:gigCandidateId`      |

The complete parameters are `startapp=editGig-<publicId>` and `startapp=editGigCandidate-<gigCandidateId>`. Read-only
actions use `startapp=openGig-<publicId>` and `startapp=openGigCandidate-<gigCandidateId>`. The separator is a hyphen.
The `/admin/telegram` parser removes only a known action prefix, so hyphens inside a Gig `publicId` remain part of the
identifier. Missing, malformed, untyped, and unknown actions show an explicit error notification before returning the
administrator to `/admin`.
