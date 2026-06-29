# SENTINEL.md — Plex Data Vault

## Project Overview

Sentinel is a self-hosted Plex data collection and API service. It connects to a Plex Media Server via WebSocket, captures all playback events in real time, stores them in PostgreSQL, and exposes a clean versioned REST + WebSocket API for any consuming application.

It is the data backbone for the LFFPicard homelab ecosystem. Atrium, Atrium Rewind, and any future tool reads from Sentinel rather than querying Plex or Tautulli directly.

**Sentinel replaces Tautulli** for users in this ecosystem. It ships with a Tautulli database import tool so existing users can migrate their history.

---

## Goals

- Fast, reliable event ingestion from Plex — nothing gets missed
- PostgreSQL with proper indexing — history queries in milliseconds, not 10–30 seconds
- Clean, versioned API that consuming projects can depend on
- Admin UI for setup, monitoring, import, and DB management — no CLI required
- Single docker-compose stack — easy to install, easy to maintain
- Tautulli import as a first-class onboarding experience

---

## What Sentinel Is NOT

- Not a UI for watching stats — that is Atrium Rewind's job
- Not a media manager — it doesn't control Plex
- Not a notification system in v1 — notifications are Phase 2
- Not a replacement for Atrium — it feeds Atrium, it doesn't replace it

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript strict | Consistent with ecosystem |
| Collector runtime | Node.js 20 | Long-running async process |
| API framework | Fastify | Fast, TypeScript-native, proper WebSocket support |
| Admin UI | Vite + React | Static SPA, served by Fastify from `/admin` |
| ORM | Drizzle | Consistent with ecosystem |
| Database | PostgreSQL 17 (Alpine) | The vault |
| Plex client | Custom WebSocket client | Based on Plex WebSocket protocol — no heavy SDK |
| Container | Docker + docker-compose | Three services: postgres, collector, api |
| Package manager | npm | |

---

## Architecture

### Three services, one docker-compose

```
sentinel/
├── docker-compose.yml
├── postgres/             # No custom build — stock postgres:17-alpine
├── collector/            # Node.js event daemon — no HTTP server
└── api/                  # Fastify REST + WS API + Vite admin SPA
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17-alpine
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: sentinel
      POSTGRES_USER: sentinel
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  collector:
    build: ./collector
    depends_on: [postgres]
    restart: unless-stopped
    volumes:
      - ./data/import:/import   # Drop tautulli.db here for import
    environment:
      DATABASE_URL: postgres://sentinel:${DB_PASSWORD}@postgres:5432/sentinel
      PLEX_URL: ${PLEX_URL}
      PLEX_TOKEN: ${PLEX_TOKEN}

  api:
    build: ./api
    depends_on: [postgres]
    restart: unless-stopped
    ports:
      - "${SENTINEL_PORT:-7700}:7700"
    environment:
      DATABASE_URL: postgres://sentinel:${DB_PASSWORD}@postgres:5432/sentinel
      SENTINEL_PORT: 7700
```

### Collector responsibilities
- Maintain persistent WebSocket connection to Plex
- Parse and handle playback events (play, pause, resume, stop, scrobble)
- Write sessions and events to PostgreSQL in real time
- Run scheduled sync jobs: libraries, users, metadata
- Run import jobs (Tautulli DB import) when triggered via DB flag
- Never serves HTTP — it only reads from Plex and writes to DB

### API responsibilities
- Serve REST endpoints under `/v1/`
- Serve WebSocket endpoint at `/ws/live` for real-time stream data
- Serve Vite admin SPA as static files at `/admin`
- Handle API key authentication on all `/v1/` routes
- Expose import status and trigger endpoint for admin UI

### Why not combine collector and API into one Node process?
They can share a process (and in a future optimisation might), but keeping them as separate containers during development means the API can be restarted without interrupting event ingestion, and vice versa. For a homelab it's three containers — acceptable.

---

## PostgreSQL Schema

### Design principles
- History table partitioned by year — queries scoped to a year only touch one partition
- All foreign keys — no orphaned records
- Metadata cached in DB — no repeat Plex API calls for poster URLs
- Timestamps always stored as UTC Unix epoch integers (seconds) — no timezone drama
- Soft deletes on users (hidden flag) — don't lose history when a user leaves

```sql
-- users
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  plex_id     TEXT UNIQUE NOT NULL,       -- Plex user ID (stable)
  username    TEXT NOT NULL,               -- Plex username (may change)
  display_name TEXT,                       -- Override shown in UI
  email       TEXT,
  thumb       TEXT,                        -- Avatar URL
  is_owner    BOOLEAN DEFAULT false,
  hidden      BOOLEAN DEFAULT false,       -- Soft hide from API responses
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- libraries
CREATE TABLE libraries (
  id          SERIAL PRIMARY KEY,
  plex_key    TEXT UNIQUE NOT NULL,        -- Plex library section ID
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,               -- movie | show | music | photo
  agent       TEXT,
  thumb       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- metadata (cached per rating key)
CREATE TABLE metadata (
  id              SERIAL PRIMARY KEY,
  rating_key      TEXT UNIQUE NOT NULL,    -- Plex rating key
  parent_key      TEXT,                    -- For episodes: season key
  grandparent_key TEXT,                    -- For episodes: show key
  library_id      INTEGER REFERENCES libraries(id),
  type            TEXT NOT NULL,           -- movie | episode | track
  title           TEXT NOT NULL,
  grandparent_title TEXT,                  -- Show title for episodes
  parent_title    TEXT,                    -- Season title for episodes
  year            INTEGER,
  thumb           TEXT,                    -- Poster URL (relative Plex path)
  art             TEXT,                    -- Background art URL
  duration        INTEGER,                 -- Milliseconds
  genres          TEXT[],                  -- Array of genre strings
  studio          TEXT,
  content_rating  TEXT,
  summary         TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- session_history (partitioned by year)
-- Parent table — do not query directly, query via partitions or the view
CREATE TABLE session_history (
  id              BIGSERIAL,
  user_id         INTEGER REFERENCES users(id),
  metadata_id     INTEGER REFERENCES metadata(id),
  session_key     TEXT,                    -- Plex session key (for dedup)
  started_at      INTEGER NOT NULL,        -- UTC epoch
  stopped_at      INTEGER,                 -- NULL if session still open
  duration        INTEGER,                 -- Seconds actually watched (not media duration)
  progress        INTEGER,                 -- Percentage 0-100
  complete        BOOLEAN DEFAULT false,   -- True if watched to ≥90%
  platform        TEXT,                    -- Plex client platform
  player          TEXT,                    -- Player device name
  ip_address      TEXT,
  transcode_decision TEXT,                 -- direct | copy | transcode
  video_decision  TEXT,
  audio_decision  TEXT,
  quality_profile TEXT,
  imported        BOOLEAN DEFAULT false,   -- True if migrated from Tautulli
  year            INTEGER NOT NULL         -- Partition key (derived from started_at)
) PARTITION BY RANGE (year);

-- Yearly partitions (create for each year of data + current year)
CREATE TABLE session_history_2022 PARTITION OF session_history FOR VALUES FROM (2022) TO (2023);
CREATE TABLE session_history_2023 PARTITION OF session_history FOR VALUES FROM (2023) TO (2024);
CREATE TABLE session_history_2024 PARTITION OF session_history FOR VALUES FROM (2024) TO (2025);
CREATE TABLE session_history_2025 PARTITION OF session_history FOR VALUES FROM (2025) TO (2026);
CREATE TABLE session_history_2026 PARTITION OF session_history FOR VALUES FROM (2026) TO (2027);
-- New partitions created automatically by the collector at year rollover

-- api_keys
CREATE TABLE api_keys (
  id          SERIAL PRIMARY KEY,
  key_hash    TEXT UNIQUE NOT NULL,        -- bcrypt hash — never store raw key
  label       TEXT NOT NULL,              -- "Atrium", "Rewind", etc.
  tier        TEXT NOT NULL,              -- admin | read
  last_used   INTEGER,
  created_at  INTEGER NOT NULL
);

-- settings (key/value)
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- Keys: plex_url, plex_token, plex_server_name, plex_machine_id, setup_complete

-- import_jobs
CREATE TABLE import_jobs (
  id          SERIAL PRIMARY KEY,
  source      TEXT NOT NULL,              -- tautulli
  status      TEXT NOT NULL,              -- pending | running | complete | failed
  total       INTEGER,
  processed   INTEGER DEFAULT 0,
  errors      INTEGER DEFAULT 0,
  error_log   TEXT,
  started_at  INTEGER,
  completed_at INTEGER,
  created_at  INTEGER NOT NULL
);
```

### Indexes
```sql
-- History queries almost always filter by user + date range
CREATE INDEX idx_history_user_started ON session_history (user_id, started_at);
CREATE INDEX idx_history_metadata ON session_history (metadata_id);
CREATE INDEX idx_history_started ON session_history (started_at);
CREATE INDEX idx_history_year_user ON session_history (year, user_id);

-- Metadata lookups by rating key
CREATE INDEX idx_metadata_rating_key ON metadata (rating_key);
CREATE INDEX idx_metadata_grandparent ON metadata (grandparent_key);
```

---

## REST API

All routes require an `Authorization: Bearer sk_xxxxx` header. Admin routes require an admin-tier key.

### Base URL: `/v1/`

#### Status + Health
```
GET  /v1/status
```
Returns: server info, collector WebSocket status, last event timestamp, DB record counts, Plex server name.

#### Sessions (live)
```
GET  /v1/sessions/live
```
Returns: array of currently active Plex streams with user, media, progress, transcode decision.

WebSocket alternative: `ws://host:7700/ws/live` — pushes updates on every session change event.

#### History
```
GET  /v1/history
  ?user_id=         filter by user
  ?from=            Unix timestamp
  ?to=              Unix timestamp
  ?year=            shorthand for full year (overrides from/to)
  ?library_type=    movie | show | music
  ?limit=           default 100, max 1000
  ?offset=          pagination
  ?complete=        true | false
```
Returns: paginated array of play history with joined metadata and user info.

#### Stats
```
GET  /v1/stats/server
  ?period=          7d | 30d | 90d | 365d | all
  ?year=            calendar year

GET  /v1/stats/user/:user_id
  ?year=            calendar year (required for wrapped data)
  ?period=          for non-wrapped stats
```
Server stats returns: total plays, total hours, unique users, top content, daily play counts, heatmap data, library breakdown.
User stats returns: total plays, total hours, top shows, top movies, genre breakdown, peak day/hour, heatmap, personality type classification.

#### Users
```
GET  /v1/users                   list all (non-hidden) users with summary stats
GET  /v1/users/:id               single user
```

#### Libraries
```
GET  /v1/libraries               all libraries with record counts
```

#### Metadata
```
GET  /v1/metadata/:rating_key    cached metadata + poster URL for a media item
```

#### Admin routes (admin key required)
```
GET    /v1/admin/settings              read all settings
PUT    /v1/admin/settings              update settings
POST   /v1/admin/api-keys              create a new API key
DELETE /v1/admin/api-keys/:id          revoke an API key
GET    /v1/admin/api-keys              list all keys (hashed, never raw)
POST   /v1/admin/import/tautulli       trigger Tautulli import (file must be in /import volume)
GET    /v1/admin/import/status         poll import job progress
POST   /v1/admin/users/:id/purge       async purge all history for a user
GET    /v1/admin/users/:id/purge/status poll purge job progress
POST   /v1/admin/maintenance/vacuum    trigger VACUUM ANALYZE
GET    /v1/admin/maintenance/status    DB size, last vacuum, health
```

---

## WebSocket — Live Streams

Endpoint: `ws://host:7700/ws/live`

Requires API key passed as query param: `?key=sk_xxxxx`

Pushes a JSON message on every Plex playback event:
```json
{
  "event": "play" | "pause" | "resume" | "stop" | "progress",
  "session": {
    "session_key": "abc123",
    "user": { "id": 1, "display_name": "Gary" },
    "media": { "title": "...", "type": "episode", "thumb": "..." },
    "progress": 42,
    "state": "playing"
  }
}
```

Also pushes a `heartbeat` event every 30 seconds so clients know the connection is alive.

---

## Admin UI

Vite + React SPA, built to `api/public/admin/`, served statically by Fastify at `/admin`.
All API calls go to the same Fastify instance — no CORS, no separate origin.

### Pages

**`/admin/`** — Status
- Collector: connected / disconnected + reconnect button
- Last playback event received (timestamp + what it was)
- Active streams count
- DB record counts (total sessions, users, libraries, metadata items)
- DB size on disk
- Plex server name + version

**`/admin/settings`** — Settings
- Plex URL + Plex token (test connection button)
- Sentinel port
- App display name

**`/admin/api-keys`** — API Key Management
- List of all keys: label, tier, last used, created date
- Generate new key form: label + tier selector
- Raw key shown ONCE on creation (copy prompt)
- Revoke button per key (confirm dialog)

**`/admin/import`** — Tautulli Import
- Instructions: mount tautulli.db to `/import/tautulli.db`
- Detection: shows "File found — X records detected" or "No file detected"
- Start Import button
- Progress bar: `Processed 12,450 / 45,230 records (27%)`
- Error count shown live
- Completion summary: imported, skipped, errors
- Import log (last 50 error lines)

**`/admin/users`** — User Management
- Table: display name, Plex username, total plays, total hours, last seen, hidden toggle
- Per-user actions: Edit display name, Hide from API, Purge all history
- Purge flow: confirmation modal → async job → live progress → completion

**`/admin/libraries`** — Library Management
- Table: library name, type, record count
- Remove library + all history (confirmation required)

**`/admin/maintenance`** — Database Maintenance
- DB size, estimated row counts per table
- VACUUM ANALYZE button with last-run timestamp
- Bulk history cleanup: delete all records before [date picker]
- Log viewer: last 100 collector log lines, auto-refreshes

---

## Collector Architecture

```
collector/src/
├── index.ts              Entry point — starts all services
├── plex/
│   ├── websocket.ts      Persistent WebSocket to Plex — auto-reconnect with backoff
│   └── events.ts         Event type definitions and parser
├── handlers/
│   ├── onPlay.ts         Handle play event — create or resume session
│   ├── onPause.ts        Update session state
│   ├── onResume.ts       Update session state
│   └── onStop.ts         Finalise session — calculate duration, set complete flag
├── jobs/
│   ├── scheduler.ts      Cron scheduler (node-cron) for sync jobs
│   ├── syncLibraries.ts  Sync library list from Plex every 6 hours
│   ├── syncUsers.ts      Sync user list from Plex every hour
│   └── syncMetadata.ts   Fetch and cache metadata for any rating key not in DB
├── import/
│   └── tautulli.ts       Tautulli SQLite → PostgreSQL migration job
└── db/
    └── index.ts          Drizzle client (shared schema from ../shared/)
```

### Plex WebSocket
Plex exposes a WebSocket at `ws://plex-ip:32400/:/websockets/notifications?X-Plex-Token=TOKEN`. Sentinel connects to this on startup, parses notification events, and routes them to the appropriate handler.

Auto-reconnect: exponential backoff starting at 5s, capping at 5 minutes. Reconnection attempts logged. Collector status reflects disconnected state so the admin UI can surface it.

### Session lifecycle
```
onPlay    → INSERT session (started_at = now, status = playing)
onPause   → UPDATE session (state = paused)
onResume  → UPDATE session (state = playing)
onStop    → UPDATE session (stopped_at = now, duration = elapsed, complete = progress >= 90)
```

Edge case: Plex sometimes doesn't send a stop event (known WebSocket bug). Collector runs a cleanup job every 5 minutes that closes any sessions with no update in >15 minutes and calculates duration from last known timestamp.

---

## Tautulli Import

### Overview
Tautulli uses SQLite with three tables that together make up a play history record. The import job reads all three via a JOIN and maps them into Sentinel's PostgreSQL schema. Real-world data: a typical active server has 100k–200k records and a DB size of 500MB–1GB.

### Tautulli SQLite schema (confirmed from real DB)

**`session_history`** — one row per play session
```sql
id, reference_id, started, stopped, rating_key, user_id, user, ip_address,
paused_counter, player, product, product_version, platform, platform_version,
profile, machine_id, bandwidth, location, quality_profile, secure, relayed,
parent_rating_key, grandparent_rating_key, media_type, view_offset, section_id
```

**`session_history_metadata`** — media info, joined on `id = session_history.id`
```sql
id, rating_key, parent_rating_key, grandparent_rating_key, title, parent_title,
grandparent_title, original_title, full_title, media_index, parent_media_index,
thumb, parent_thumb, grandparent_thumb, art, media_type, year,
originally_available_at, added_at, updated_at, last_viewed_at, content_rating,
summary, tagline, rating, duration, guid, directors, writers, actors, genres,
studio, labels, live, channel_call_sign, channel_identifier, channel_thumb,
marker_credits_first, marker_credits_final, channel_id, channel_title, channel_vcn
```

**`session_history_media_info`** — stream/transcode info, joined on `id = session_history.id`
```sql
id, rating_key, video_decision, audio_decision, transcode_decision, duration,
container, bitrate, width, height, video_bitrate, video_bit_depth, video_codec,
video_codec_level, video_width, video_height, video_resolution, video_framerate,
video_scan_type, video_full_resolution, video_dynamic_range, aspect_ratio,
audio_bitrate, audio_codec, audio_channels, transcode_protocol, transcode_container,
transcode_video_codec, transcode_audio_codec, transcode_audio_channels,
transcode_width, transcode_height, transcode_hw_requested, transcode_hw_full_pipeline,
transcode_hw_decode, transcode_hw_decode_title, transcode_hw_decoding,
transcode_hw_encode, transcode_hw_encode_title, transcode_hw_encoding,
stream_container, stream_container_decision, stream_bitrate, stream_video_decision,
stream_video_bitrate, stream_video_codec, stream_video_codec_level,
stream_video_bit_depth, stream_video_height, stream_video_width,
stream_video_resolution, stream_video_framerate, stream_video_scan_type,
stream_video_full_resolution, stream_video_dynamic_range, stream_audio_decision,
stream_audio_codec, stream_audio_bitrate, stream_audio_channels,
stream_subtitle_decision, stream_subtitle_codec, stream_subtitle_container,
stream_subtitle_forced, subtitles, subtitle_codec, synced_version,
synced_version_profile, optimized_version, optimized_version_profile,
optimized_version_title, audio_language, audio_language_code, stream_audio_language,
stream_audio_language_code, subtitle_language, stream_subtitle_language,
subtitle_forced
```

### Schema mapping — Tautulli → Sentinel

**session_history**
```
sh.started                           → started_at
sh.stopped                           → stopped_at
sh.stopped - sh.started - sh.paused_counter → duration (seconds actually watched)
sh.paused_counter                    → (used in duration calc only)
sh.user                              → lookup/create in users table by username
sh.rating_key                        → lookup/create in metadata table
sh.ip_address                        → ip_address
sh.player                            → player
sh.product                           → platform (e.g. "Plex for Windows", "Plex Web")
sh.quality_profile                   → quality_profile
sh.location                          → location (wan | lan)
shmi.transcode_decision              → transcode_decision
shmi.video_decision                  → video_decision
shmi.audio_decision                  → audio_decision
                                       imported = true
                                       session_key = 'tautulli_{sh.id}'
```

**metadata** (from session_history_metadata)
```
shm.rating_key                       → rating_key
shm.parent_rating_key                → parent_key
shm.grandparent_rating_key           → grandparent_key
shm.title                            → title
shm.parent_title                     → parent_title
shm.grandparent_title                → grandparent_title
shm.media_type                       → type (movie | episode | track)
shm.year                             → year
shm.thumb                            → thumb
shm.art                              → art
shm.duration                         → duration (milliseconds — media length, NOT watch time)
shm.content_rating                   → content_rating
shm.summary                          → summary
shm.studio                           → studio
shm.genres                           → genres (stored as comma-separated string in Tautulli)
sh.section_id                        → library_id (via lookup on libraries.plex_key)
```

**users** (from session_history)
```
sh.user                              → username
sh.user_id                           → used as plexId prefix: 'tautulli_{user_id}'
                                       (real Plex ID resolved on next syncUsers run)
```

### Duration calculation — IMPORTANT
Tautulli's `paused_counter` is in seconds. Watch duration is:
```
watch_duration = stopped - started - paused_counter
```
`session_history_media_info.duration` is the **media duration in milliseconds** — not the watch time. Use it only for calculating the `complete` flag:
```
complete = watch_duration >= (shm.duration / 1000) * 0.9
```

### File detection and job flow
1. User mounts their Tautulli appdata directory to `/import` in the collector container
2. Sentinel detects `tautulli.db` at `/import/tautulli.db` — shown in admin UI Import page
3. Admin clicks Import — API creates a `pending` import_job record
4. Collector job watcher (polls every 10s) picks up the pending job
5. Import runs in batches of 500 records with progress written to `import_jobs` after each batch
6. Admin UI polls `GET /v1/admin/import/status` every 2s to show live progress
7. On completion: summary of imported/skipped/errored records shown

### What gets skipped
- Records where `stopped` is NULL or 0 (session never ended cleanly)
- Records where `title` is NULL (no metadata to link)
- Duplicate `session_key` values (dedup via `tautulli_{id}` prefix)

### Local development override
The import path defaults to `/import/tautulli.db` (the Docker volume path).
For local dev without Docker, override via environment variable:
```
IMPORT_PATH=C:\Development\tautulli.db
```

### Performance expectations
172k records (typical large install) should import in 5–15 minutes depending on hardware.
The bottleneck is the per-row PostgreSQL upserts. Batch size of 500 is a good balance between
progress granularity and DB write performance. Do not increase beyond 1000.

---

## Folder Structure

```
sentinel/
├── SENTINEL.md
├── README.md
├── LICENSE                       GPL-3.0
├── docker-compose.yml
├── .env.example
│
├── data/                         Docker volume root (user mounts this)
│   ├── postgres/                 PostgreSQL data files
│   └── import/                   Drop tautulli.db here
│
├── shared/                       Shared TypeScript — imported by collector + api
│   ├── package.json
│   ├── schema.ts                 Drizzle schema (single source of truth)
│   └── types.ts                  Shared API response types
│
├── collector/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       (see Collector Architecture above)
│
└── api/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts              Fastify server entry
    │   ├── auth.ts               API key middleware
    │   ├── routes/
    │   │   ├── status.ts
    │   │   ├── history.ts
    │   │   ├── stats.ts
    │   │   ├── users.ts
    │   │   ├── libraries.ts
    │   │   ├── metadata.ts
    │   │   ├── sessions.ts
    │   │   └── admin/
    │   │       ├── settings.ts
    │   │       ├── apiKeys.ts
    │   │       ├── import.ts
    │   │       ├── users.ts
    │   │       └── maintenance.ts
    │   └── ws/
    │       └── live.ts           WebSocket live stream handler
    └── admin/                    Vite + React SPA
        ├── vite.config.ts
        ├── package.json
        └── src/
            ├── App.tsx
            ├── main.tsx
            ├── api/
            │   └── client.ts     Typed fetch wrappers for Sentinel API
            └── pages/
                ├── Status.tsx
                ├── Settings.tsx
                ├── ApiKeys.tsx
                ├── Import.tsx
                ├── Users.tsx
                ├── Libraries.tsx
                └── Maintenance.tsx
```

---

## Build Phases

### Phase 0 — Foundation — COMPLETE
- Repo scaffold, docker-compose, shared schema
- PostgreSQL up and running with migrations
- Collector connects to Plex WebSocket, logs events
- Basic session write to DB on play/stop

### Phase 1 — Full event ingestion — COMPLETE
- All event handlers (play, pause, resume, stop)
- Stale session cleanup job
- Library + user sync jobs (90 users, 15 libraries confirmed)
- Metadata fetch + cache on demand
- Confirmed: real Plex events flowing, sessions saving to PostgreSQL with full linkage

### Phase 2 — API — COMPLETE
- All REST endpoints live on port 7700
- API key authentication (admin + read tiers, bcryptjs hashing)
- WebSocket live endpoint (placeholder — full push in Phase 3)
- Admin routes: settings, API keys, import trigger, user management, maintenance
- Confirmed: all endpoints tested and returning real data

### Phase 3 — Admin UI — COMPLETE
- Vite + React SPA served at /admin by Fastify static plugin
- All pages working: Status, Settings, API Keys, Import, Users, Libraries, Maintenance
- Login via admin API key stored in localStorage
- DB size, VACUUM, bulk cleanup, collector logs all wired up
- Confirmed: accessible at http://localhost:7700/admin

### Phase 4 — Tautulli Import — COMPLETE ✅

- Import job in collector (`collector/src/import/tautulli.ts`) — batch processing, progress reporting
- Job watcher polling DB for pending jobs (`collector/src/import/jobWatcher.ts`)
- Schema mapping complete — see Tautulli Import section above
- Admin import route (`api/src/routes/admin/import.ts`)
- TypeScript ESM + drizzle-orm dedup issues resolved
- User lookup keyed on `user_id` (stable); plexId = `tautulli_{user_id}`
- Metadata upsert: `INSERT ... ON CONFLICT DO UPDATE RETURNING id` — single round trip, no error cascade
- Defensive integer coercion (`toInt` / `toIntStr`) for Tautulli fields that may be empty string instead of NULL (`year`, `duration`, `section_id`, `parent_rating_key`, `grandparent_rating_key`)
- Import summary JSON written to `error_log` at completion; error log display strips the JSON summary so it only shows actual error lines
- onPlay user upsert: `INSERT ... ON CONFLICT (plex_id) DO UPDATE` — race-condition safe, always returns DB id
- onStop: skips session save if userId is null; surfaces Postgres error cause in logs
- Admin UI Import page: raw fetch polling (2s recursive setTimeout), progress bar, elapsed time counter, synthetic pending job on trigger for instant feedback, completion stat grid from parsed summary JSON, failed state banner
- API key prefix optimisation: `key_prefix` column stores first 16 chars of raw key; auth is now O(1) bcrypt instead of O(n)
- `/v1/status` moved behind auth (was leaking Plex URL and DB stats publicly)
- Static file cache headers: `index.html` = no-cache; hashed assets = immutable 1 year
- **Confirmed: 172,050 sessions imported, 172,049 metadata linked, 58 users created, 0 errors**

### Phase 5 — Polish + Distribution
- Docker Hub push: `lffpicard/sentinel`
- Unraid Community Applications template
- README with install guide and screenshots
- Update Atrium to call Sentinel API (remove Tautulli module)
- Update Atrium Rewind design to confirm Sentinel API calls
- Artwork proxy endpoint: GET /v1/artwork/:ratingKey

---

## Known Gotchas — IMPORTANT

- **Plex WebSocket stop events are unreliable.** Plex has a known bug where stop events sometimes don't fire. Always run a stale session cleanup job (every 5 minutes) to close sessions with no activity in 15+ minutes. Duration is calculated from last known timestamp.
- **Plex tokens expire.** The Plex token stored in settings is a managed access token. If Sentinel starts logging auth failures, the token needs refreshing — surface this in the admin UI status page.
- **Partition creation at year rollover.** The collector must create the new year's partition before January 1. Run a check job in December that creates the next year's partition if it doesn't exist.
- **Tautulli usernames vs Plex IDs.** Tautulli stores history against Plex usernames (strings). Plex IDs (integers) are more stable. During import, match by username; after import, sync to confirm Plex IDs. Users who have changed their Plex username since Tautulli recorded their history may not match cleanly — log these for manual review.
- **API key storage.** Never store raw API keys. Hash with bcrypt on creation, show raw key to user once (in admin UI generation dialog), store only the hash. On auth, hash the incoming key and compare. Same pattern as passwords.
- **Shared package in Docker.** The `shared/` package is referenced by both `collector/` and `api/`. In Docker builds, copy the shared package into each container's build context and reference it via a local `file:../shared` path in package.json. The docker-compose build context must be the repo root for this to work.
- **Fastify + Vite admin SPA.** Build the Vite SPA (`npm run build` in `api/admin/`) before building the API Docker image. The Dockerfile must run the admin build step and copy `admin/dist/` to the location Fastify serves static files from.
- **drizzle-orm must only exist in shared/package.json.** Both collector and api reference drizzle-orm through @sentinel/shared. If drizzle-orm is also installed in collector/node_modules or api/node_modules, TypeScript sees two separate type trees and throws incompatible type errors on every Drizzle query. If this happens: remove drizzle-orm from the offending package.json and run npm install.
- **PowerShell does not support `<` redirection.** Use `Get-Content file.sql | docker exec -i container psql ...` instead. The `<` operator is reserved in PowerShell and will throw a parser error.
- **drizzle-kit push and migrate hang silently on WSL2.** Use `drizzle-kit generate` to produce SQL migration files, then pipe them via `Get-Content migrations\file.sql | docker exec -i sentinel-postgres psql -U sentinel -d sentinel`. This is the confirmed working pattern for this dev environment.
- **Tautulli `paused_counter` is in seconds, not milliseconds.** Duration calculation is `stopped - started - paused_counter`. Do not divide paused_counter by 1000.
- **Tautulli `duration` in session_history_media_info is media duration in milliseconds** — not watch time. Only use it for the `complete` flag calculation. Watch time comes from `stopped - started - paused_counter`.
- **Poster artwork is served from Plex directly.** Sentinel stores relative Plex thumb paths (e.g. `/library/metadata/34195/thumb/...`). Consuming apps must construct the full URL using the Plex server URL and token. For external-facing apps, add a `/v1/artwork/:ratingKey` proxy endpoint to Sentinel that fetches the image internally and streams it back — never expose the Plex token client-side.
- **LFFPicard (server owner) returns userId=1 from the Plex API.** This is correct Plex behaviour for the server owner account, not a bug.
- **API response shape mismatch on import status.** The import status endpoint returns `{ latestJob, fileDetected, fileSizeBytes }` not `{ job, ... }`. If the import UI shows no progress bar or counts despite the API returning data, check that the SPA is reading `data.latestJob` not `data.job` from the status response.

---

## Notes for Claude

- The Drizzle schema in `shared/schema.ts` is the single source of truth for the DB — never write raw SQL migrations by hand; generate them with `drizzle-kit generate`
- The collector never serves HTTP — if something needs to be surfaced to the API, write it to the DB and let the API read it
- Import and purge jobs are always async — update a jobs table, return a job ID, let the client poll. Never block a request for a long-running operation.
- The WebSocket live endpoint pushes to all connected clients on every Plex event — use Fastify's `@fastify/websocket` plugin
- Stats queries are the performance-critical path. All stats API routes should query the partitioned history table with explicit year filters and use the indexes defined in the schema. If a query plan looks wrong, add it to this doc.
- When adding a new API endpoint, add it to this doc's REST API section before implementing — design first, build second
