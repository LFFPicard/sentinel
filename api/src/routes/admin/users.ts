import { FastifyInstance } from 'fastify'
import { db, pool } from '../../db.js'
import { users } from '@sentinel/shared/src/schema'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../auth.js'

export async function adminUserRoutes(app: FastifyInstance) {
  app.patch<{ Params: { id: string }; Body: { hidden: boolean } }>(
    '/users/:id',
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return

      const id = parseInt(request.params.id, 10)
      if (Number.isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })

      const { hidden } = request.body
      if (typeof hidden !== 'boolean') return reply.code(400).send({ error: 'hidden must be a boolean' })

      await db
        .update(users)
        .set({ hidden, updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(users.id, id))

      return { success: true }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/users/:id/purge',
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return

      const id = parseInt(request.params.id, 10)
      if (Number.isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })

      const result = await pool.query(
        'DELETE FROM session_history WHERE user_id = $1',
        [id],
      )

      return { deleted: result.rowCount ?? 0 }
    },
  )
}
