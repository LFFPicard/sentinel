import WebSocket from 'ws'
import { RawPlexNotification } from './events.js'
import { log } from '../logger.js'

const RECONNECT_BASE_MS = 5000
const RECONNECT_MAX_MS = 300000 // 5 minutes

export type PlexWebSocketOptions = {
  plexUrl: string
  plexToken: string
  onEvent: (notification: RawPlexNotification) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export function connectToPlexWebSocket(options: PlexWebSocketOptions): () => void {
  const { plexUrl, plexToken, onEvent, onConnect, onDisconnect } = options
  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let stopped = false

  const wsUrl = `${plexUrl.replace('http', 'ws')}/:/websockets/notifications?X-Plex-Token=${plexToken}`

  function connect() {
    if (stopped) return

    log.info(`[Plex WS] Connecting to ${plexUrl}...`)
    ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      log.info('[Plex WS] Connected')
      reconnectAttempts = 0
      onConnect?.()
    })

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const notification = JSON.parse(data.toString()) as RawPlexNotification
        onEvent(notification)
      } catch (err) {
        log.error(`[Plex WS] Failed to parse message: ${err instanceof Error ? err.message : String(err)}`)
      }
    })

    ws.on('close', () => {
      log.warn('[Plex WS] Disconnected')
      onDisconnect?.()
      scheduleReconnect()
    })

    ws.on('error', (err) => {
      log.error(`[Plex WS] Error: ${err.message}`)
    })
  }

  function scheduleReconnect() {
    if (stopped) return
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), RECONNECT_MAX_MS)
    reconnectAttempts++
    log.info(`[Plex WS] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`)
    setTimeout(connect, delay)
  }

  connect()

  // Return a stop function
  return () => {
    stopped = true
    ws?.close()
  }
}