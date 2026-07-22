# 3D Master

Web-based organizer for 3D printing workshops.

Manage **printers**, **model inventory**, **filament**, **maintenance**, and **print timers** from one self-hosted app. Data stays on your server in a persistent volume.

![License: MIT](https://img.shields.io/badge/license-MIT-green)

## Features

- **Model inventory** — upload `.stl`, `.3mf`, `.obj`, `.gcode`, and related formats; download for your slicer; optional collapsed-by-default in-browser 3D preview
- **Per-printer print queue** — queue models, download when ready, remove when done
- **Filament inventory** (shared) — grams remaining, roll count, manufacturer, bag-opened flag, one-click “dried now” with age-colored reminders
- **Printer maintenance** — nozzle age, last cleaned, one-click “cleaned now” with age-colored reminders
- **Print timer** — countdown per printer; when finished, optionally download the next queued model (with consent)
- **Multi-printer** — each printer has its own queue, maintenance, and timer
- **Optional auth** — off for local/dev; Docker Compose defaults to auth on with OIDC (group-gated) and/or username/password

## Quick start (Docker Compose)

```bash
cp .env.example .env
# set AUTH_SECRET=$(openssl rand -base64 32) — required by Compose (auth on by default)
# optional: AUTH_BOOTSTRAP_USER / AUTH_BOOTSTRAP_PASSWORD for local logins
docker compose up -d --build
```

Open http://localhost:3000

Persistent data (database + model files) lives in the `3dmaster-data` volume at `/data`.
Compose builds from the local Dockerfile by default (`build: .`) and also tags `image: ghcr.io/photoncody/3dmaster:latest`. Use `docker compose up -d --build` for a local build, or pull the published image if you prefer.
Compose defaults to `AUTH_ENABLED=true` and requires `AUTH_SECRET` in your environment/`.env`. For a trusted local-only quick start without auth, set `AUTH_ENABLED=false` and `ALLOW_INSECURE_NO_AUTH=true`.

### Pull from GHCR

```bash
docker pull ghcr.io/photoncody/3dmaster:latest
docker compose up -d
```

## Local development

```bash
npm install
cp .env.example .env
mkdir -p data
DATABASE_URL="file:$(pwd)/data/3dmaster.db" npx prisma migrate dev
npm run dev
```

The app opens SQLite from `DATA_DIR` at runtime. Use an absolute `DATABASE_URL` when running Prisma CLI commands so migrations target the same database instead of `prisma/data/3dmaster.db`.

### Tests

```bash
npm test
```

Vitest covers age/color helpers, storage safety, rate limiting, timer math, slicer adapter registration, and API route handlers (printers, filament, models, queue, maintenance, timer, health) against a temporary SQLite database.

## Health checks

- `/api/health` is a liveness endpoint and does not touch the database.
- `/api/health/ready` checks database readiness and is used by the Docker healthcheck.

## Authentication

Auth is **off by default** for local development (`AUTH_ENABLED=false`). Only use that on a trusted LAN. Production runs with auth disabled require `ALLOW_INSECURE_NO_AUTH=true`.

To enable:

```env
AUTH_ENABLED=true
AUTH_SECRET=long-random-string-at-least-32-chars
AUTH_CREDENTIALS_ENABLED=true
AUTH_BOOTSTRAP_USER=admin
AUTH_BOOTSTRAP_PASSWORD=change-me
AUTH_URL=https://3dmaster.example.com
AUTH_TRUST_HOST=true
```

Disable username/password auth with `AUTH_CREDENTIALS_ENABLED=false` when using OIDC only.

### OIDC + group membership

```env
OIDC_ISSUER=https://idp.example.com/application/o/3dmaster/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_GROUP_CLAIM=groups
OIDC_ALLOWED_GROUPS=3d-printers
```

Users must appear in at least one allowed group (claim name configurable). Empty `OIDC_ALLOWED_GROUPS` denies all OIDC users unless you explicitly set `OIDC_ALLOW_ALL_GROUPS=true`. Local username/password remains available as a fallback when credentials auth is enabled. When auth is on, all authorized users share one workshop (no per-user libraries).

When running behind a trusted reverse proxy, set `TRUST_PROXY=true` so login rate limiting can use `X-Forwarded-For`/`X-Real-IP`. Leave it unset when the app is exposed directly.

## Security notes

- Put 3D Master behind HTTPS (Caddy, Traefik, or nginx) when reachable beyond localhost
- Use a strong `AUTH_SECRET` and bootstrap password before production use
- Enable auth if the instance is not on a trusted network
- Uploads are extension-allowlisted and size-limited; files are stored outside the web root under `/data/models`
- Security headers (CSP, frame denial, nosniff) are enabled by default

## Configuration

See [`.env.example`](.env.example) for all options (upload limits, drying/cleaning color thresholds, OIDC, etc.).

## Slicer handoff

v1 focuses on **download for slicer** (Bambu Studio, PrusaSlicer, etc.). The codebase includes an extension point at `src/features/models/slicer-handoff.ts` for future LAN/cloud send adapters.

## License

MIT — see [LICENSE](LICENSE).
