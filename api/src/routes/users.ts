import { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { users, sessionHistory } from '@sentinel/shared/src/schema'
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm'

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', async () => {
    const result = await db
      .select({
        id: users.id,
        plexId: users.plexId,
        username: users.username,
        displayName: users.displayName,
        thumb: users.thumb,
        isOwner: users.isOwner,
        totalSessions: sql<number>`count(${sessionHistory.id})`,
      })
      .from(users)
      .leftJoin(sessionHistory, eq(users.id, sessionHistory.userId))
      .where(and(eq(users.hidden, false), isNotNull(users.username), ne(users.username, '')))
      .groupBy(users.id)
      .orderBy(desc(sql`count(${sessionHistory.id})`))

    return { users: result }
  })

  app.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(id)))
      .limit(1)

    if (result.length === 0) {
      return reply.code(404).send({ error: 'User not found' })
    }

    return { user: result[0] }
  })
}