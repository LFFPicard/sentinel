import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from './db.js'
import { apiKeys } from '@sentinel/shared/src/schema'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

// Routes that don't require auth
// NOTE: /v1/status is intentionally NOT here — it exposes Plex URL, DB stats,
// and server info. Use /health for uptime monitors.
const PUBLIC_ROUTES = ['/health', '/favicon.ico']
const PUBLIC_PREFIXES = ['/admin']

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (PUBLIC_ROUTES.includes(request.url)) return
  if (PUBLIC_PREFIXES.some(prefix => request.url.startsWith(prefix))) return

  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid Authorization header' })
  }

  const rawKey = authHeader.slice(7)

  // Fast path: look up by the first 16 chars of the raw key (stored at creation time).
  // This reduces bcrypt comparisons from O(n) to O(1) regardless of how many keys exist.
  // Keys created before this change have a 'legacy_N' placeholder prefix and will not
  // match — they must be regenerated via the admin UI.
  const keyPrefix = rawKey.slice(0, 16)
  const candidates = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, keyPrefix))

  if (candidates.length === 0) {
    return reply.code(401).send({ error: 'Invalid API key' })
  }

  const matched = candidates.find(k => bcrypt.compareSync(rawKey, k.keyHash))

  if (!matched) {
    return reply.code(401).send({ error: 'Invalid API key' })
  }

  // Attach tier to request for admin route checks
  ;(request as any).keyTier = matched.tier
  ;(request as any).keyId = matched.id

  // Update last used (fire-and-forget — don't block the request)
  const now = Math.floor(Date.now() / 1000)
  void db.update(apiKeys).set({ lastUsed: now }).where(eq(apiKeys.id, matched.id))
}

// Helper for admin-only routes
export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if ((request as any).keyTier !== 'admin') {
    reply.code(403).send({ error: 'Admin key required' })
    return false
  }
  return true
}