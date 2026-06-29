import { db } from '../db/index.js'
import { users, eq } from '@sentinel/shared/src/schema'
import { log } from '../logger.js'

const PLEX_URL = process.env.PLEX_URL!
const PLEX_TOKEN = process.env.PLEX_TOKEN!

export async function syncUsers() {
  log.info('[syncUsers] Starting...')

  try {
    const res = await fetch(
      `${PLEX_URL}/accounts?X-Plex-Token=${PLEX_TOKEN}`,
      { headers: { Accept: 'application/json' } }
    )

    if (!res.ok) {
      log.error(`[syncUsers] Failed: ${res.status}`)
      return
    }

    const data = await res.json() as any
    const accounts = data?.MediaContainer?.Account ?? []
    const now = Math.floor(Date.now() / 1000)

    for (const account of accounts) {
      const plexId = String(account.id)
      const existing = await db.select()
        .from(users)
        .where(eq(users.plexId, plexId))
        .limit(1)

      if (existing.length > 0) {
        await db.update(users)
          .set({
            username: account.name,
            thumb: account.thumb ?? null,
            updatedAt: now,
          })
          .where(eq(users.plexId, plexId))
      } else {
        await db.insert(users).values({
          plexId,
          username: account.name,
          thumb: account.thumb ?? null,
          isOwner: account.id === 1,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    log.info(`[syncUsers] Done — ${accounts.length} accounts`)
  } catch (err) {
    log.error(`[syncUsers] Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}