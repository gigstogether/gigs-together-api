# Local API HTTPS access with Cloudflare Tunnel

Expose the local backend over HTTPS for API requests and Telegram bot webhooks.

## Install

- **Windows:** install the MSI from [Cloudflare downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/#windows) and add the installation directory to `PATH`.
- **macOS:** run `brew install cloudflared`.

## Create or reuse your tunnel

Use one tunnel per developer, for example `gigs-alice`. If you already created it for another application, reuse its name, UUID, and credentials. Otherwise, create it below; this requires permission to manage tunnels in the Cloudflare account that owns the domain.

```text
cloudflared tunnel login
cloudflared tunnel create <tunnel-name>
```

Creation returns the UUID and credentials JSON path. Keep credentials and the account certificate `cert.pem` outside Git.

Choose an unused API hostname, for example `api-alice.gigstogether.com`, and create its DNS route in the same account (requires DNS permissions). Skip this command if the route is already configured:

```text
cloudflared tunnel route dns <tunnel-name> <api-hostname>
```

## Configure locally

Manually create or edit `config.yml` in `%USERPROFILE%\.cloudflared` (Windows) or `~/.cloudflared` (macOS). For an existing file, keep its tunnel settings and other ingress rules; add the API rule before the single final `http_status:404` rule. A new file looks like this:

```yaml
tunnel: <tunnel-uuid>
credentials-file: '<absolute-path-to-credentials-json>'

ingress:
  - hostname: <api-hostname>
    service: http://localhost:3000
  - service: http_status:404
```

Use the UUID and credentials path returned by creation. Use forward slashes in Windows paths; the hostname must not include a protocol or port.

In this repository's `.env`, set `PORT=3000` alongside the other required settings. For browser integration, set `CORS_ORIGINS` to the client's actual origin and `APP_BASE_URL` to the frontend URL used for generated links; that frontend can run remotely.

## Run

With the API running on port `3000`, start the tunnel once in another terminal:

```text
cloudflared tunnel run <tunnel-name>
```

Check `https://<api-hostname>/health`. Keep the terminal open; stop with `Ctrl+C`. If the tunnel is already running for another application, restart it after editing `config.yml` instead of starting a second instance.

For Telegram webhooks, use `https://<api-hostname>/v1/telegram/updates` and follow [Required Telegram setup](../../README.md#required-telegram-setup). One bot has one webhook URL, so use a separate development bot for independent parallel testing.

## Update

For a standalone installation, run `cloudflared update`; for Homebrew, run `brew upgrade cloudflared`. Restart the tunnel after updating.

See [Cloudflare tunnel setup](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/) for details.
