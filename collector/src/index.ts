import { connectToPlexWebSocket } from './plex/websocket.js'
import { RawPlexNotification } from './plex/events.js'
import { onPlay } from './handlers/onPlay.js'
import { onPause } from './handlers/onPause.js'
import { onResume } from './handlers/onResume.js'
import { onStop } from './handlers/onStop.js'
import { getAllSessions, getSession, updateSession, removeSession } from './sessions/store.js'
import { db } from './db/index.js'
import { sessionHistory } from '@sentinel/shared/src/schema'
import { syncUsers } from './jobs/syncUsers.js'
import { syncLibraries } from './jobs/syncLibraries.js'
import { startJobWatcher } from './import/jobWatcher.js'
import { log } from './logger.js'

const PLEX_URL = process.env.PLEX_URL
const PLEX_TOKEN = process.env.PLEX_TOKEN

if (!PLEX_URL || !PLEX_TOKEN) {
  log.error('[Sentinel] PLEX_URL and PLEX_TOKEN are required')
  process.exit(1)
}

log.info('[Sentinel] Collector starting...')

async function handlePlexEvent(notification: RawPlexNotification) {
  const container = notification.NotificationContainer
  if (container.type !== 'playing') return

  const sessions = container.PlaySessionStateNotification ?? []

  for (const session of sessions) {
    const { sessionKey, ratingKey, viewOffset, state } = session

    if (state === 'playing') {
      const existing = getSession(sessionKey)
      if (!existing) {
        // New session
        await onPlay(sessionKey, ratingKey, viewOffset)
      } else if (existing.pausedAt !== null) {
        // Was paused, now playing again = resume
        onResume(sessionKey, viewOffset)
      } else {
        // Ongoing play event — just update position
        updateSession(sessionKey, {
          lastEventAt: Math.floor(Date.now() / 1000),
          viewOffset,
        })
      }
    } else if (state === 'paused') {
      onPause(sessionKey, viewOffset)
    } else if (state === 'stopped') {
      await onStop(sessionKey, viewOffset)
    }
  }
}

// Stale session cleanup — runs every 5 minutes
// Closes any session with no event in 15+ minutes
setInterval(async () => {
  const now = Math.floor(Date.now() / 1000)
  const staleCutoff = now - (15 * 60)

  for (const session of getAllSessions()) {
    if (session.lastEventAt < staleCutoff) {
      log.info(`[Cleanup] Closing stale session: sessionKey=${session.sessionKey}`)
      await onStop(session.sessionKey, session.viewOffset)
    }
  }
}, 5 * 60 * 1000)

connectToPlexWebSocket({
  plexUrl: PLEX_URL,
  plexToken: PLEX_TOKEN,
  onEvent: handlePlexEvent,
  onConnect: () => log.info('[Sentinel] Plex WebSocket live'),
  onDisconnect: () => log.info('[Sentinel] Plex WebSocket disconnected'),
})

// Run sync jobs on startup
syncUsers()
syncLibraries()
startJobWatcher()

// Re-sync on schedule
setInterval(syncUsers, 60 * 60 * 1000)          // every hour
setInterval(syncLibraries, 6 * 60 * 60 * 1000)  // every 6 hours

process.on('SIGTERM', () => {
  log.info('[Sentinel] Shutting down')
  process.exit(0)
})
