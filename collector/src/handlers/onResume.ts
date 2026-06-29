import { updateSession, getSession } from '../sessions/store.js'
import { log } from '../logger.js'

export function onResume(sessionKey: string, viewOffset: number) {
  const session = getSession(sessionKey)
  if (!session) return

  const now = Math.floor(Date.now() / 1000)

  // Accumulate paused duration
  const additionalPause = session.pausedAt ? now - session.pausedAt : 0

  updateSession(sessionKey, {
    pausedAt: null,
    pausedDuration: session.pausedDuration + additionalPause,
    lastEventAt: now,
    viewOffset,
  })

  log.info(`[onResume] sessionKey=${sessionKey} pausedFor=${additionalPause}s total paused=${session.pausedDuration + additionalPause}s`)
}