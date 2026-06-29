import { FastifyInstance } from 'fastify'
import { db, pool } from '../db.js'
import { users, libraries, metadata, sessionHistory, settings } from '@sentinel/shared/src/schema'
import { inArray, sql } from 'drizzle-orm'

async function fetchPlexInfo(plexUrl: string, plexToken: string) {
  try {
    const url = plexUrl.replace(/\/$/, '') + '/'
    const res = await fetch(url, {
      headers: { 'X-Plex-Token': plexToken, Accept: 'text/xml' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return { serverName: null, version: null }
    const xml = await res.text()
    return {
      serverName: /friendlyName="([^"]*)"/.exec(xml)?.[1] ?? null,
      version: /\bversion="([^"]*)"/.exec(xml)?.[1] ?? null,
    }
  } catch {
    return { serverName: null, version: null }
  }
}

export async function statusRoutes(app: FastifyInstance) {
  app.get('/status', async () => {
    const [counts, plexSettings, sizeResult] = await Promise.all([
      Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(libraries),
        db.select({ count: sql<number>`count(*)` }).from(metadata),
        db.select({ count: sql<number>`count(*)` }).from(sessionHistory),
      ]),
      db.select().from(settings).where(inArray(settings.key, ['plex_url', 'plex_token'])),
      pool.query<{ size_bytes: string }>('SELECT pg_database_size(current_database()) AS size_bytes'),
    ])

    const [[userCount], [libraryCount], [metadataCount], [sessionCount]] = counts
    const sizeBytes = parseInt(sizeResult.rows[0]?.size_bytes ?? '0', 10)
    const plexUrl = plexSettings.find(s => s.key === 'plex_url')?.value ?? null
    const plexToken = plexSettings.find(s => s.key === 'plex_token')?.value ?? null

    const plexInfo = plexUrl && plexToken
      ? await fetchPlexInfo(plexUrl, plexToken)
      : { serverName: null, version: null }

    return {
      status: 'ok',
      version: '1.0.0',
      database: {
        users: Number(userCount.count),
        libraries: Number(libraryCount.count),
        metadata: Number(metadataCount.count),
        sessions: Number(sessionCount.count),
        sizeBytes,
      },
      plex: {
        url: plexUrl,
        serverName: plexInfo.serverName,
        version: plexInfo.version,
      },
    }
  })
}
