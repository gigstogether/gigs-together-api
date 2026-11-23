# Local HTTPS access with Cloudflare Tunnel

Public HTTPS access to the local API and frontend, including Telegram bot webhook handling and Mini App development.

## Install

- **Windows:** install the MSI from [Cloudflare downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/#windows) and add the installation directory to `PATH`.
- **macOS:** run `brew install cloudflared`.

## Create your tunnel

You need permission to manage tunnels and DNS in the Cloudflare account that owns the domain. Choose an unused tunnel name and two unused hostnames, for example `gigs-alice`, `api-alice.gigstogether.com`, and `alice.gigstogether.com`. Replace the placeholders below with your values.

```text
cloudflared tunnel login
cloudflared tunnel create <tunnel-name>
```

Creation returns the tunnel UUID and saves `<tunnel-uuid>.json` credentials in the local `.cloudflared` directory. Keep this file and the account certificate `cert.pem` outside Git.

## Configure locally

Manually create `config.yml` in `%USERPROFILE%\.cloudflared` (Windows) or `~/.cloudflared` (macOS):

```yaml
tunnel: <tunnel-uuid>
credentials-file: '<absolute-path-to-credentials-json>'

ingress:
  - hostname: <api-hostname>
    service: http://localhost:3000
  - hostname: <frontend-hostname>
    service: http://localhost:3001
  - service: http_status:404
```

Use the UUID and credentials path returned by creation; use forward slashes in Windows paths. Set the two hostnames to your own subdomains, without a protocol or port.

Validate the config and create DNS routes to your tunnel:

```text
cloudflared tunnel ingress validate
cloudflared tunnel route dns <tunnel-name> <api-hostname>
cloudflared tunnel route dns <tunnel-name> <frontend-hostname>
```

## Application settings

Replace the hostname placeholders below, set these values alongside the other required environment variables, then restart the applications:

| File                  | Variable                       | Value                         |
| --------------------- | ------------------------------ | ----------------------------- |
| Backend `.env.dev`    | `PORT`                         | `3000`                        |
| Backend `.env.dev`    | `APP_BASE_URL`                 | `https://<frontend-hostname>` |
| Backend `.env.dev`    | `CORS_ORIGINS`                 | `https://<frontend-hostname>` |
| Frontend `.env.local` | `NEXT_PUBLIC_APP_API_BASE_URL` | `https://<api-hostname>`      |
| Frontend `.env.local` | `NEXT_PUBLIC_APP_BASE_URL`     | `https://<frontend-hostname>` |
| Frontend `.env.local` | `ALLOWED_DEV_ORIGINS`          | `<frontend-hostname>`         |

Note: one Telegram bot has one webhook URL. Follow [Required Telegram setup](../../README.md#required-telegram-setup) with your frontend URL and webhook `https://<api-hostname>/v1/telegram/updates`.

## Run

With the API on port `3000` and frontend on port `3001`, start your tunnel in a separate terminal:

```text
cloudflared tunnel run <tunnel-name>
```

Check `https://<api-hostname>/health` and `https://<frontend-hostname>`. Keep the terminal open; stop with `Ctrl+C`. Restart the tunnel after editing `config.yml`.

## Update

For a standalone installation, run:

```text
cloudflared update
```

For Homebrew, run `brew upgrade cloudflared` instead. Restart the tunnel after updating.

See [Cloudflare tunnel setup](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/) for details.
