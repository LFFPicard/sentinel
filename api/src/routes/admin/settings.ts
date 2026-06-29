import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../db.js'
import { settings } from '@sentinel/shared/src/schema'
import { eq, sql } from 'drizzle-orm'
import { requireAdmin } from '../../auth.js'

export async function adminSettingsRoutes(app: FastifyInstance) {
  app.get('/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return

    const result = await db.select().from(settings)
    const settingsMap = Object.fromEntries(result.map(s => [s.key, s.value]))
    return { settings: settingsMap }
  })

  app.put('/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return

    const body = request.body as Record<string, string>
    const now = Math.floor(Date.now() / 1000)

    for (const [key, value] of Object.entries(body)) {
      const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
      if (existing.length > 0) {
        await db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, key))
      } else {
        await db.insert(settings).values({ key, value, updatedAt: now })
      }
    }

    return { success: true }
  })
}