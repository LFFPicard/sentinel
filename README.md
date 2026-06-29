# Sentinel

> Self-hosted Plex data vault for the modern homelab.

Sentinel connects to your Plex Media Server via WebSocket, captures every playback event in real time, and stores your complete watch history in PostgreSQL. It exposes a clean, versioned REST and WebSocket API that any app can consume — no more slow Tautulli queries, no more SQLite bottlenecks.

Built as the data backbone for the [LFFPicard homelab ecosystem](https://github.com/LFFPicard), powering [Atrium](https://github.com/LFFPicard/atrium) and [Atrium Rewind](https://github.com/LFFPicard/atrium-rewind).

---

## Features

- **Real-time event ingestion** — play, pause, resume, stop events captured via Plex WebSocket
- **PostgreSQL vault** — proper indexing and year partitioning means history queries in milliseconds, not 10–30 seconds
- **Clean versioned API** — REST endpoints under `/v1/` and a WebSocket live stream at `/ws/live`
- **Tautulli import** — migrate your full history in one click via the admin UI. 172k records in ~11 minutes.
- **Admin UI** — status, settings, API key management, import, user management, and database maintenance at `/admin`
- **No cloud dependencies** — fully self-hosted, runs entirely on your hardware

---

## Screenshots

> *(Screenshots coming soon)*

<!-- Admin dashboard screenshot -->
<!-- Import progress screenshot -->
<!-- Status page screenshot -->

---

## Requirements

- Docker + Docker Compose
- A running Plex Media Server
- Your Plex token (see below for how to find it)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/LFFPicard/sentinel.git
cd sentinel

# 2. Copy the example env file and fill in your values
cp .env.example .env

# 3. Start the stack
docker compose up -d

# 4. Open the admin UI
# Visit http://your-server-ip:7700/admin
```

---

## Environment Variables

Copy `.env.example` to `.env` and set the following:

| Variable | Required | Description |
|---|---|---|
| `DB_PASSWORD` | Yes | Password for the internal PostgreSQL database |
| `PLEX_URL` | Yes | Full URL to your Plex server e.g. `http://192.168.1.x:32400` |
| `PLEX_TOKEN` | Yes | Your Plex authentication token |
| `SENTINEL_PORT` | No | Port to expose the API on. Default: `7700` |

### Finding your Plex token

1. Open Plex Web in your browser
2. Play any item
3. Go to **Settings → Troubleshooting → Get an X-Plex-Token**

Or check your existing Tautulli settings — it will be stored there.

---

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: sentinel-postgres
    restart: unless-stopped
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: sentinel
      POSTGRES_USER: sentinel
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  collector:
    image: lffpicard/sentinel-collector:latest
    container_name: sentinel-collector
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./data/import:/import
      - ./data/logs:/data/logs
    environment:
      DATABASE_URL: postgres://sentinel:${DB_PASSWORD}@postgres:5432/sentinel
      PLEX_URL: ${PLEX_URL}
      PLEX_TOKEN: ${PLEX_TOKEN}

  api:
    image: lffpicard/sentinel-api:latest
    container_name: sentinel-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${SENTINEL_PORT:-7700}:7700"
    environment:
      DATABASE_URL: postgres://sentinel:${DB_PASSWORD}@postgres:5432/sentinel
      SENTINEL_PORT: 7700
```

---

## Tautulli Migration

Sentinel ships with a first-class Tautulli import tool. Your years of history come with you.

1. Locate your `tautulli.db` file (usually in your Tautulli appdata directory)
2. Copy it to `./data/import/tautulli.db` on your host
3. Open the Sentinel admin UI at `/admin` → **Import**
4. Click **Start Import** and watch the progress bar
5. On completion you'll see a summary of imported sessions, metadata linked, and users created
6. Tautulli can then be uninstalled

---

## API

All endpoints require an `Authorization: Bearer sk_xxxxx` header.

### Core endpoints

```
GET  /v1/status                    Server info, DB counts, collector status
GET  /v1/history                   Paginated play history
GET  /v1/users                     All users with summary stats
GET  /v1/libraries                 All libraries with record counts
GET  /v1/metadata/:ratingKey       Cached metadata + poster path for a media item
GET  /v1/sessions/live             Current active streams
```

### Query parameters for `/v1/history`

| Parameter | Description |
|---|---|
| `user_id` | Filter by user |
| `year` | Full calendar year e.g. `2024` |
| `from` | Unix timestamp |
| `to` | Unix timestamp |
| `limit` | Default 100, max 1000 |
| `offset` | Pagination |
| `complete` | `true` or `false` |

### Admin endpoints (admin key required)

```
GET    /v1/admin/settings
PUT    /v1/admin/settings
GET    /v1/admin/api-keys
POST   /v1/admin/api-keys
DELETE /v1/admin/api-keys/:id
POST   /v1/admin/import/tautulli
GET    /v1/admin/import/status
POST   /v1/admin/users/:id/purge
POST   /v1/admin/maintenance/vacuum
DELETE /v1/admin/history
DELETE /v1/admin/reset
```

### WebSocket

```
ws://host:7700/ws/live?key=sk_xxxxx
```

Pushes a JSON message on every Plex playback event.

---

## API Keys

Sentinel uses two key tiers:

- **Admin key** — full access including settings, import, and database management. Generated on first setup via the admin UI.
- **Read key** — read-only access to history, stats, users, and metadata. Generate one per consuming app (Atrium, Rewind, etc.)

Keys are hashed with bcrypt on creation. The raw key is shown **once** — copy it immediately.

---

## Consuming Apps

Any app can call Sentinel's API with a read key. Configure consuming apps with:

```env
SENTINEL_URL=http://your-server-ip:7700
SENTINEL_API_KEY=sk_read_xxxxxxxxxxxx
```

---

## Unraid

Sentinel is available in the Unraid Community Applications store.

Search for **LFFPicard - Sentinel** and install. The template pre-configures the volume paths and environment variables.

---

## Licence

GPL-3.0 — see [LICENSE](LICENSE)

---

## Part of the LFFPicard Homelab Ecosystem

- [Atrium](https://github.com/LFFPicard/atrium) — self-hosted homelab portal
- [Atrium Rewind](https://github.com/LFFPicard/atrium-rewind) — Spotify Wrapped-style stats for Plex
