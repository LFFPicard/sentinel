export type PlexEventType =
  | 'playing'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'scrobble'

export type PlexSessionState =
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'stopped'

export type PlexEvent = {
  event: PlexEventType
  sessionKey: string
  ratingKey: string
  title: string
  type: 'movie' | 'episode' | 'track'
  state: PlexSessionState
  viewOffset: number    // milliseconds
  duration: number      // milliseconds
  userId: string
  username: string
  platform: string
  player: string
  ipAddress: string
  transcodeDecision: string
  videoDecision: string
  audioDecision: string
}

// Raw shape coming off the Plex WebSocket before we parse it
export type RawPlexNotification = {
  NotificationContainer: {
    type: string
    size: number
    PlaySessionStateNotification?: Array<{
      sessionKey: string
      ratingKey: string
      viewOffset: number
      state: string
      key: string
    }>
  }
}