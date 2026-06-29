// In-memory store for active Plex sessions
// Holds state between events until a session is finalised (stopped/complete)

export type ActiveSession = {
  sessionKey: string
  ratingKey: string
  userId: number | null
  metadataId: number | null
  startedAt: number        // Unix epoch seconds
  lastEventAt: number      // Unix epoch seconds — for stale detection
  pausedAt: number | null  // When the current pause started
  pausedDuration: number   // Total accumulated pause seconds
  viewOffset: number       // Last known viewOffset in ms
  platform: string | null
  player: string | null
  ipAddress: string | null
  transcodeDecision: string | null
  videoDecision: string | null
  audioDecision: string | null
  qualityProfile: string | null
}

const sessions = new Map<string, ActiveSession>()

export function getSession(sessionKey: string): ActiveSession | undefined {
  return sessions.get(sessionKey)
}

export function setSession(sessionKey: string, session: ActiveSession): void {
  sessions.set(sessionKey, session)
}

export function removeSession(sessionKey: string): void {
  sessions.delete(sessionKey)
}

export function getAllSessions(): ActiveSession[] {
  return Array.from(sessions.values())
}

export function updateSession(sessionKey: string, updates: Partial<ActiveSession>): void {
  const existing = sessions.get(sessionKey)
  if (existing) {
    sessions.set(sessionKey, { ...existing, ...updates })
  }
}