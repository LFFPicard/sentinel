// These are the shapes the API returns to consuming apps (Atrium, Rewind etc.)
// Keep these separate from the DB schema types

export type ApiUser = {
  id: number
  plexId: string
  username: string
  displayName: string | null
  thumb: string | null
  isOwner: boolean
}

export type ApiLibrary = {
  id: number
  plexKey: string
  name: string
  type: string
  recordCount: number
}

export type ApiMetadata = {
  id: number
  ratingKey: string
  type: string
  title: string
  grandparentTitle: string | null
  parentTitle: string | null
  year: number | null
  thumb: string | null
  duration: number | null
}

export type ApiSession = {
  sessionKey: string
  user: ApiUser
  media: ApiMetadata
  progress: number
  state: 'playing' | 'paused' | 'buffering'
  transcodeDecision: string | null
  platform: string | null
  player: string | null
}

export type ApiHistoryEntry = {
  id: number
  user: ApiUser
  media: ApiMetadata
  startedAt: number
  stoppedAt: number | null
  duration: number | null
  progress: number | null
  complete: boolean
  platform: string | null
  transcodeDecision: string | null
}

export type ImportStatus = {
  id: number
  source: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  total: number | null
  processed: number
  errors: number
  startedAt: number | null
  completedAt: number | null
}