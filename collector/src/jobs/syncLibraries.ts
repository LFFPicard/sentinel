import { db } from '../db/index.js'
import { libraries, eq } from '@sentinel/shared/src/schema'
import { log } from '../logger.js'

const PLEX_URL = process.env.PLEX_URL!
const PLEX_TOKEN = process.env.PLEX_TOKEN!

export async function syncLibraries() {
  log.info('[syncLibraries] Starting...')

  try {
    const res = await fetch(
      `${PLEX_URL}/library/sections?X-Plex-Token=${PLEX_TOKEN}`,
      { headers: { Accept: 'application/json' } }
    )

    if (!res.ok) {
      log.error(`[syncLibraries] Failed: ${res.status}`)
      return
    }

    const data = await res.json() as any
    const sections = data?.MediaContainer?.Directory ?? []
    const now = Math.floor(Date.now() / 1000)

    for (const section of sections) {
      const plexKey = String(section.key)
      const existing = await db.select()
        .from(libraries)
        .where(eq(libraries.plexKey, plexKey))
        .limit(1)

      if (existing.length > 0) {
        await db.update(libraries)
          .set({
            name: section.title,
            type: section.type,
            agent: section.agent ?? null,
            updatedAt: now,
          })
          .where(eq(libraries.plexKey, plexKey))
      } else {
        await db.insert(libraries).values({
          plexKey,
          name: section.title,
          type: section.type,
          agent: section.agent ?? null,
          thumb: section.thumb ?? null,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    log.info(`[syncLibraries] Done — ${sections.length} libraries`)
  } catch (err) {
    log.error(`[syncLibraries] Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}