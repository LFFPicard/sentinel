import { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { libraries, sessionHistory, metadata } from '@sentinel/shared/src/schema'
import { asc, eq, sql } from 'drizzle-orm'

export async function libraryRoutes(app: FastifyInstance) {
  app.get('/libraries', async () => {
    const result = await db
      .select({
        id: libraries.id,
        plexKey: libraries.plexKey,
        name: libraries.name,
        type: libraries.type,
        metadataCount: sql<number>`count(distinct ${metadata.id})`,
      })
      .from(libraries)
      .leftJoin(metadata, eq(libraries.id, metadata.libraryId))
      .groupBy(libraries.id)
      .orderBy(asc(libraries.name))

    return { libraries: result }
  })
}