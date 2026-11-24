# Telegram integration

Use one bot per environment for suggestions, moderation, alerts, and sign-in. A bot has one webhook URL, so use a
separate development bot when testing locally. Variable requirements and defaults are in the
[backend environment reference](../configuration/ENVIRONMENT.md) and
[frontend environment reference](https://github.com/gigstogether/gigs-together-front/blob/main/docs/configuration/ENVIRONMENT.md).

For frontend configuration and checks, see the
[frontend Telegram guide](https://github.com/gigstogether/gigs-together-front/blob/main/docs/integrations/TELEGRAM.md).

## Shared setup

### BotFather and Mini Apps

Create or select the environment's bot in BotFather, then create two named Direct Mini Apps for that bot:

| Purpose       | Backend short-name setting             | Frontend URL                             |
| ------------- | -------------------------------------- | ---------------------------------------- |
| Suggestions   | `TELEGRAM_SUGGEST_MINI_APP_SHORT_NAME` | `https://<frontend-host>/suggest/launch` |
| Admin actions | `TELEGRAM_ADMIN_MINI_APP_SHORT_NAME`   | `https://<frontend-host>/admin/telegram` |

Use the actual BotFather short names; `suggest` and `admin` are the template examples. Keep Same-Origin Restriction
enabled. Main App and Menu Button are optional; backend-generated action links use the named apps.

The resulting links have the form `https://t.me/<bot_username>/<short_name>`; see Telegram's
[Direct Link Mini Apps documentation](https://core.telegram.org/bots/webapps#direct-link-mini-apps). Open both links in
a Telegram client to verify the BotFather setup; the backend only checks that short names are non-empty.

Shared-chat suggestion buttons use the suggestion Direct Mini App link. Private-chat suggestion buttons instead open
`APP_BASE_URL/suggest/launch` as a `web_app` button. The suggestion entry point sends an application admin to the new
GigCandidate form and other users to `/suggest`.

### Web Login

Register the frontend origin among the bot's allowed Login URLs in BotFather, as described in
[Telegram Login setup](https://core.telegram.org/bots/telegram-login#registering-your-allowed-urls). Use the same issued
Client ID in both applications.

### Admin launch actions

The backend URL composer and frontend launch parser share these `startapp` values:

| `startapp` value                    | Identifier      | Admin destination                            |
| ----------------------------------- | --------------- | -------------------------------------------- |
| `editGig-<publicId>`                | Gig `publicId`  | `/admin/gigs/:publicId/edit`                 |
| `editGigCandidate-<gigCandidateId>` | GigCandidate ID | `/admin/gig-candidates/:gigCandidateId/edit` |
| `openGig-<publicId>`                | Gig `publicId`  | `/admin/gigs/:publicId`                      |
| `openGigCandidate-<gigCandidateId>` | GigCandidate ID | `/admin/gig-candidates/:gigCandidateId`      |

Links use `https://t.me/<bot_username>/<admin_short_name>?startapp=<action>-<identifier>`. The separator is a hyphen;
hyphens inside a Gig `publicId` remain part of the identifier. GigCandidate IDs must contain 24 hexadecimal characters.
Missing, malformed, or unknown actions show an error notification and return the user to `/admin`.

## Backend setup

Complete the [shared setup](#shared-setup), then configure the API:

- `BOT_TOKEN`: this environment's BotFather token.
- `TELEGRAM_SUGGEST_MINI_APP_SHORT_NAME` and `TELEGRAM_ADMIN_MINI_APP_SHORT_NAME`: the named apps created above.
- `TELEGRAM_OIDC_CLIENT_ID`: the shared Web Login Client ID.
- `APP_BASE_URL`: the frontend HTTPS base URL, matching frontend `NEXT_PUBLIC_APP_BASE_URL`.

### Channels and suggestion group

For channel destinations, add the bot as an administrator with permission to send posts (`can_post_messages`).

| Channel                     | Backend setting              |
| --------------------------- | ---------------------------- |
| Main gig channel            | `MAIN_CHANNEL_ID`            |
| New raw submissions         | `INTAKE_CHANNEL_ID`          |
| Moderation                  | `MODERATION_CHANNEL_ID`      |
| Internal application alerts | `ALERTS_TELEGRAM_CHANNEL_ID` |

In groups/supergroups, the bot can be a regular member with permission to receive commands and send replies;
administrator rights are not required. Set the suggestion group's numeric ID as `MAIN_CHAT_ID`. Suggestions use `/gig`.

### Webhook

Register `https://<api-host>/v1/telegram/updates` using Telegram
[`setWebhook`](https://core.telegram.org/bots/api#setwebhook), passing backend `BOT_SECRET` as `secret_token`. Telegram
sends it in `X-Telegram-Bot-Api-Secret-Token`; the backend checks this header.

Use [`getWebhookInfo`](https://core.telegram.org/bots/api#getwebhookinfo) to confirm the exact URL and inspect delivery
errors. For a local API, use the public HTTPS hostname from the
[Cloudflare Tunnel guide](../development/CLOUDFLARE_TUNNEL.md).

### Backend checks

- The API initializes successfully and Telegram `getMe` identifies the intended bot.
- Intake, moderation, main posts, and alerts reach their configured channels.
