import { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { sessionHistory, users, metadata } from '@sentinel/shared/src/schema'
import { eq, and, gte, lte, sql } from 'drizzle-orm'

export async function historyRoutes(app: FastifyInstance) {
  app.get('/history', async (request) => {
    const query = request.query as {
      user_id?: string
      from?: string
      to?: string
      year?: string
      limit?: string
      offset?: string
      complete?: string
    }

    const limit = Math.min(parseInt(query.limit ?? '100'), 1000)
    const offset = parseInt(query.offset ?? '0')

    const conditions = []

    if (query.user_id) {
      conditions.push(eq(sessionHistory.userId, parseInt(query.user_id)))
    }

    if (query.year) {
      const year = parseInt(query.year)
      const from = Math.floor(new Date(`${year}-01-01`).getTime() / 1000)
      const to = Math.floor(new Date(`${year + 1}-01-01`).getTime() / 1000)
      conditions.push(gte(sessionHistory.startedAt, from))
      conditions.push(lte(sessionHistory.startedAt, to))
    } else {
      if (query.from) conditions.push(gte(sessionHistory.startedAt, parseInt(query.from)))
      if (query.to) conditions.push(lte(sessionHistory.startedAt, parseInt(query.to)))
    }

    if (query.complete !== undefined) {
      conditions.push(eq(sessionHistory.complete, query.complete === 'true'))
    }

    const result = await db
      .select({
        id: sessionHistory.id,
        startedAt: sessionHistory.startedAt,
        stoppedAt: sessionHistory.stoppedAt,
        duration: sessionHistory.duration,
        progress: sessionHistory.progress,
        complete: sessionHistory.complete,
        platform: sessionHistory.platform,
        player: sessionHistory.player,
        transcodeDecision: sessionHistory.transcodeDecision,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          thumb: users.thumb,
        },
        media: {
          id: metadata.id,
          type: metadata.type,
          title: metadata.title,
          grandparentTitle: metadata.grandparentTitle,
          parentTitle: metadata.parentTitle,
          year: metadata.year,
          thumb: metadata.thumb,
        },
      })
      .from(sessionHistory)
      .leftJoin(users, eq(sessionHistory.userId, users.id))
      .leftJoin(metadata, eq(sessionHistory.metadataId, metadata.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset)
      .orderBy(sql`${sessionHistory.startedAt} DESC`)

    return {
      history: result,
      pagination: { limit, offset, returned: result.length },
    }
  })
}