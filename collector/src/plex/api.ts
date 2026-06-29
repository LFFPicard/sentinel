// Single Plex API call we need — fetch active sessions to get
// full metadata (IP, platform, player, transcode info) on play event
import { log } from '../logger.js'

export type PlexSessionDetail = {
  sessionKey: string
  ratingKey: string
  userId: string
  username: string
  platform: string
  product: string
  player: string
  ipAddress: string
  transcodeDecision: string
  videoDecision: string
  audioDecision: string
  qualityProfile: string
  viewOffset: number
  duration: number
  state: string
}

export async function fetchPlexSessions(
  plexUrl: string,
  plexToken: string
): Promise<PlexSessionDetail[]> {
  const url = `${plexUrl}/status/sessions?X-Plex-Token=${plexToken}`

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      log.error(`[Plex API] Sessions fetch failed: ${res.status}`)
      return []
    }

    const data = await res.json() as any

    const items = data?.MediaContainer?.Metadata ?? []

    return items.map((item: any) => ({
      sessionKey: item.sessionKey ?? '',
      ratingKey: item.ratingKey ?? '',
      userId: item.User?.id ?? '',
      username: item.User?.title ?? 'Unknown',
      platform: item.Player?.platform ?? null,
      product: item.Player?.product ?? null,
      player: item.Player?.title ?? null,
      ipAddress: item.Player?.remotePublicAddress ?? null,
      transcodeDecision: item.TranscodeSession?.decision ?? 'direct',
      videoDecision: item.TranscodeSession?.videoDecision ?? 'direct',
      audioDecision: item.TranscodeSession?.audioDecision ?? 'direct',
      qualityProfile: item.TranscodeSession?.qualityEstimate ?? null,
      viewOffset: item.viewOffset ?? 0,
      duration: item.duration ?? 0,
      state: item.Player?.state ?? 'playing',
    }))
  } catch (err) {
    log.error(`[Plex API] Failed to fetch sessions: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}