import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../db.js'
import { apiKeys } from '@sentinel/shared/src/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '../../auth.js'
import { randomBytes } from 'crypto'

export async function adminApiKeyRoutes(app: FastifyInstance) {
  app.get('/api-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return

    const result = await db.select({
      id: apiKeys.id,
      label: apiKeys.label,
      tier: apiKeys.tier,
      lastUsed: apiKeys.lastUsed,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys)

    return { apiKeys: result }
  })

  app.post('/api-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return

    const { label, tier } = request.body as { label: string, tier: 'admin' | 'read' }

    if (!label || !tier) {
      return reply.code(400).send({ error: 'label and tier are required' })
    }

    // Generate raw key — shown once, never stored
    const rawKey = `sk_${tier}_${randomBytes(24).toString('hex')}`
    const keyHash = await bcrypt.hash(rawKey, 10)
    const keyPrefix = rawKey.slice(0, 16)
    const now = Math.floor(Date.now() / 1000)

    const inserted = await db.insert(apiKeys).values({
      keyHash,
      keyPrefix,
      label,
      tier,
      createdAt: now,
    }).returning({ id: apiKeys.id })

    return {
      id: inserted[0].id,
      label,
      tier,
      key: rawKey, // shown ONCE — not stored
      warning: 'Copy this key now. It will never be shown again.',
    }
  })

  app.delete<{ Params: { id: string } }>('/api-keys/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return

    const id = parseInt(request.params.id, 10)
    if (Number.isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })

    await db.delete(apiKeys).where(eq(apiKeys.id, id))
    return { success: true }
  })
}