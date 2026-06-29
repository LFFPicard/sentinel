import { updateSession, getSession } from '../sessions/store.js'
import { log } from '../logger.js'

export function onPause(sessionKey: string, viewOffset: number) {
  const session = getSession(sessionKey)
  if (!session) return

  const now = Math.floor(Date.now() / 1000)

  updateSession(sessionKey, {
    pausedAt: now,
    lastEventAt: now,
    viewOffset,
  })

  log.info(`[onPause] sessionKey=${sessionKey}`)
}