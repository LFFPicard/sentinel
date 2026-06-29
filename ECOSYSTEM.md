# ECOSYSTEM.md — LFFPicard Homelab Project Ecosystem

## Overview

This document is the master context file for the LFFPicard homelab project ecosystem. It defines the relationships between all projects, shared conventions, naming standards, and architectural principles that apply across everything. Load this file alongside a project-specific file (SENTINEL.md, ATRIUM.md, etc.) when doing cross-project work, or load it alone to get oriented.

All projects are self-hosted, Docker-distributed, GPL-3.0 licensed, and built with no cloud dependencies. Target audience: homelab enthusiasts, primarily Plex users.

---

## Projects in the Ecosystem

### Sentinel *(new build)*
**Role:** The data backbone. A Plex media server event collector + PostgreSQL vault + REST/WebSocket API. Everything else feeds from Sentinel.
**Status:** Design complete, not yet built.
**Repo:** `github.com/LFFPicard/sentinel`
**Docker Hub:** `lffpicard/sentinel`
**Port (default):** `7700`
**Spec:** See `SENTINEL.md`

### Atrium *(existing)*
**Role:** Self-hosted homelab portal. Organizr replacement. Module system, Tautulli stats, Sonarr/Radarr calendar, Overseerr bridge, internal messaging, Wrapped summaries.
**Status:** Phase 1 complete. Tautulli module to be replaced with Sentinel module in a future phase.
**Repo:** `github.com/LFFPicard/atrium`
**Docker Hub:** `lffpicard/atrium`
**Spec:** See `ATRIUM.md`

### Atrium Rewind *(designed, not yet built)*
**Role:** Plex Wrapped — Spotify Wrapped-style personal year-in-review plus a global server dashboard. Standalone Docker app. Calls Sentinel API directly.
**Status:** Fully designed, build not started.
**Repo:** `github.com/LFFPicard/atrium-rewind`
**Docker Hub:** `lffpicard/atrium-rewind`
**Port (default):** `3001`
**Spec:** See `ATRIUM-REWIND.md`

### ShiftCheck *(existing, paused)*
**Role:** WTR fatigue compliance SaaS for shift workers. Rota upload, compliance scoring, reporting.
**Status:** Admin section built, paused pending testing window.
**Spec:** See `SHIFTCHECK.md`

### GGSUnite *(existing)*
**Role:** Unite rep management platform for Gatwick Ground Services reps.
**Status:** Live at unite.garythwaites.com
**Stack:** Next.js 15 / Supabase / Vercel (cloud-hosted, exception to the self-hosted rule)

---

## How the Projects Relate

```
Plex Media Server
      │
      │  WebSocket (playback events)
      ▼
  SENTINEL
  ├── PostgreSQL (the vault — all history, metadata, users, libraries)
  ├── Fastify REST API  → /v1/...
  └── WebSocket API     → /ws/live
      │
      ├──▶ Atrium Rewind   (stats, wrapped data, live streams)
      ├──▶ Atrium           (stats widget, now playing, wrapped module)
      └──▶ Future projects  (anything needing Plex data)
```

**Key principle:** No project talks to Plex directly for history or stats. Sentinel owns that. Projects that currently call the Tautulli API will be migrated to call Sentinel's API instead.

---

## Shared Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript strict | All projects |
| Runtime | Node.js 20+ | LTS |
| Frontend framework | Next.js 15 (App Router) | Atrium, Rewind |
| API framework | Fastify | Sentinel API layer |
| Admin UI framework | Vite + React | Sentinel admin panel (not Next.js — no SSR needed) |
| ORM | Drizzle | All projects |
| Database (app data) | SQLite via Drizzle | Atrium settings etc. |
| Database (Sentinel) | PostgreSQL 17 | History, metadata, events |
| Styling | Tailwind CSS | All frontend projects |
| Animations | Framer Motion | Rewind slide transitions |
| Charts | Recharts | All projects |
| Container | Docker + docker-compose | All projects |
| Package manager | npm | All projects |

---

## Shared Conventions

### TypeScript
- Strict mode always on (`"strict": true` in tsconfig)
- Server Components by default in Next.js projects — only use `"use client"` when required (Framer Motion, browser APIs, event handlers)
- All external service calls go through `src/lib/` clients — never call APIs directly from components or route handlers
- Shared types exported from `src/lib/types.ts` or a `shared/` package

### Docker
- All images published to Docker Hub under `lffpicard/`
- All containers support `PUID` / `PGID` env vars for permission management
- Data volumes always mount to `/data/` inside the container
- Environment variables documented in `.env.example` at repo root
- `docker-compose.yml` at repo root for single-command startup

### Ports (defaults, all user-configurable)
- Sentinel: `7700`
- Atrium: `3000`
- Atrium Rewind: `3001`
- ShiftCheck: `3002`

### Unraid
- All projects get a Community Applications XML template
- Template naming: `LFFPicard - [Project Name]`
- Category: `MediaApp` or `Tools`

### GitHub
- All repos under `github.com/LFFPicard/`
- GPL-3.0 licence on all projects
- `CLAUDE.md` or named spec file at repo root
- `README.md` with screenshots, install instructions, docker-compose example

### Theming
- Dark-first on all projects
- CSS custom properties throughout — never hardcode colours
- Atrium Dark is the base theme palette; all other projects reference or extend it
- Theme presets consistent where applicable: Plex (orange), Jellyfin (purple), AMOLED, Light

---

## API Key Model (Sentinel → Consuming Projects)

Sentinel issues API keys stored in its PostgreSQL database. Two tiers:

- **Admin key** — full access. Manage settings, trigger imports, purge data. One exists at all times (generated on first run). Managed via Sentinel admin UI.
- **Read key** — read-only access to history, stats, users, metadata. Generated per consuming app. Atrium gets one, Rewind gets one. Revocable without restarting anything.

Consuming projects store their Sentinel URL and read key in their own settings (env var or DB). Example:
```
SENTINEL_URL=http://homelab-ip:7700
SENTINEL_API_KEY=sk_read_xxxxxxxxxxxx
```

---

## Migration Path: Tautulli → Sentinel

Existing users (including the developer) will have years of history in Tautulli's SQLite database. The migration path:

1. Install Sentinel, point it at Plex — it starts collecting new events immediately
2. Use Sentinel Admin UI → Import → drop `tautulli.db` into the mounted import volume
3. Import job runs async with visible progress — no UI freeze
4. On completion, all historical data is in PostgreSQL
5. Tautulli can be uninstalled
6. Update Atrium / Rewind config to point at Sentinel instead of Tautulli

Tautulli import is a first-class feature, not an afterthought. It is the onboarding experience for the majority of users who will try Sentinel.

---

## What Not To Do

- Never introduce cloud dependencies (no Supabase, Vercel, external APIs) in self-hosted projects
- Never call Plex or Tautulli APIs directly from frontend components — always proxy through the project's own API layer
- Never expose Plex tokens or Sentinel API keys client-side
- Never use `any` in TypeScript — if a type is unknown, define it properly
- Never use `next/font` or other build-time cloud fetches in Docker builds — self-host fonts or use system fonts
- Never hardcode ports — always read from environment variables with sensible defaults

---

## Notes for Claude

- When working on any project in this ecosystem, check whether the work touches a cross-project boundary (e.g. a change to Sentinel's API shape affects Rewind and Atrium)
- The stats engine in Atrium Rewind (`src/lib/stats/`) must remain framework-agnostic — it will eventually be ported into Atrium as a module
- Sentinel's API is the source of truth for all Plex data — if a consuming project needs data that Sentinel doesn't yet expose, the right fix is to add it to Sentinel's API, not to add a Tautulli/Plex call to the consuming project
- Match coding conventions across projects — they should feel like they came from the same developer
- When in doubt about a pattern, check how Atrium does it first
