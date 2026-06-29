import { db } from '../db/index.js'
import { users } from '@sentinel/shared/src/schema'
import { setSession, getSession } from '../sessions/store.js'
import { fetchPlexSessions } from '../plex/api.js'
import { fetchAndCacheMetadata } from '../jobs/syncMetadata.js'
import { log } from '../logger.js'

const PLEX_URL = process.env.PLEX_URL!
const PLEX_TOKEN = process.env.PLEX_TOKEN!

export async function onPlay(sessionKey: string, ratingKey: string, viewOffset: number) {
  // Don't create duplicate sessions
  if (getSession(sessionKey)) {
    return
  }

  const now = Math.floor(Date.now() / 1000)

  // Fetch full session details from Plex API
  const plexSessions = await fetchPlexSessions(PLEX_URL, PLEX_TOKEN)
  const detail = plexSessions.find(s => s.sessionKey === sessionKey)

  if (!detail) {
    log.warn(`[onPlay] No session detail found for sessionKey=${sessionKey}`)
    return
  }

  // Resolve user — INSERT ... ON CONFLICT (plex_id) DO UPDATE ensures RETURNING
  // always yields the row whether the user is new or already exists, and eliminates
  // any race condition when two simultaneous play events arrive for the same new user.
  let userId: number | null = null
  try {
    const result = await db.insert(users).values({
      plexId: detail.userId,
      username: detail.username,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: users.plexId,
      set: { updatedAt: now },
    }).returning({ id: users.id })
    userId = result[0].id
    log.info(`[onPlay] User resolved: ${detail.username} (plexId=${detail.userId}) → DB id ${userId}`)
  } catch (err: any) {
    const cause = err?.cause?.message ?? err?.message ?? String(err)
    log.error(`[onPlay] User upsert failed for plexId=${detail.userId}: ${cause}`)
  }

  // Look up metadata
  let metadataId: number | null = null
  try {
    metadataId = await fetchAndCacheMetadata(ratingKey)
  } catch (err) {
    log.error(`[onPlay] Metadata fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Store in memory
  setSession(sessionKey, {
    sessionKey,
    ratingKey,
    userId,
    metadataId,
    startedAt: now,
    lastEventAt: now,
    pausedAt: null,
    pausedDuration: 0,
    viewOffset,
    platform: detail.platform,
    player: detail.player,
    ipAddress: detail.ipAddress,
    transcodeDecision: detail.transcodeDecision,
    videoDecision: detail.videoDecision,
    audioDecision: detail.audioDecision,
    qualityProfile: detail.qualityProfile,
  })

  log.info(`[onPlay] Session started: sessionKey=${sessionKey} user=${detail.username} ratingKey=${ratingKey}`)
}
