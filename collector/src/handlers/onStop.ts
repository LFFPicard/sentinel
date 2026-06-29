import { db } from '../db/index.js'
import { sessionHistory } from '@sentinel/shared/src/schema'
import { getSession, removeSession } from '../sessions/store.js'
import { log } from '../logger.js'

export async function onStop(sessionKey: string, viewOffset: number) {
  const session = getSession(sessionKey)
  if (!session) return

  const now = Math.floor(Date.now() / 1000)

  // If still paused when stopped, accumulate final pause duration
  const finalPauseDuration = session.pausedAt
    ? session.pausedDuration + (now - session.pausedAt)
    : session.pausedDuration

  const totalElapsed = now - session.startedAt
  const watchedDuration = totalElapsed - finalPauseDuration
  const progressPercent = session.viewOffset > 0
    ? Math.min(100, Math.round((session.viewOffset / 1000) / (watchedDuration || 1) * 100))
    : 0

  const complete = (session.viewOffset / 1000) >= (watchedDuration * 0.9)

  const year = new Date(session.startedAt * 1000).getFullYear()

  if (session.userId === null) {
    log.warn(`[onStop] Skipping session save: user not resolved for sessionKey=${sessionKey}`)
    removeSession(sessionKey)
    return
  }

  try {
    await db.insert(sessionHistory).values({
      userId: session.userId,
      metadataId: session.metadataId,
      sessionKey,
      startedAt: session.startedAt,
      stoppedAt: now,
      duration: watchedDuration,
      progress: progressPercent,
      complete,
      platform: session.platform,
      player: session.player,
      ipAddress: session.ipAddress,
      transcodeDecision: session.transcodeDecision,
      videoDecision: session.videoDecision,
      audioDecision: session.audioDecision,
      qualityProfile: session.qualityProfile,
      imported: false,
      year,
    })

    log.info(`[onStop] Session saved: sessionKey=${sessionKey} duration=${watchedDuration}s complete=${complete}`)
  } catch (err: any) {
    const cause = err?.cause?.message ?? err?.message ?? String(err)
    log.error(`[onStop] Failed to save session for sessionKey=${sessionKey}: ${cause}`)
  }

  removeSession(sessionKey)
}