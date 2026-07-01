import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticFiles from '@fastify/static'
import websocket from '@fastify/websocket'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'
import fs from 'fs'
import bcrypt from 'bcryptjs'
import { db } from './db.js'
import { apiKeys } from '@sentinel/shared/src/schema'
import { eq } from 'drizzle-orm'
import { adminImportRoutes } from './routes/admin/import.js'
import { statusRoutes } from './routes/status.js'
import { userRoutes } from './routes/users.js'
import { libraryRoutes } from './routes/libraries.js'
import { historyRoutes } from './routes/history.js'
import { sessionRoutes } from './routes/sessions.js'
import { adminSettingsRoutes } from './routes/admin/settings.js'
import { adminApiKeyRoutes } from './routes/admin/apiKeys.js'
import { adminUserRoutes } from './routes/admin/users.js'
import { adminMaintenanceRoutes } from './routes/admin/maintenance.js'
import { authMiddleware } from './auth.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.SENTINEL_PORT ?? '7700')

const app = Fastify({ logger: true })

await app.register(cors)
await app.register(websocket)

// Admin SPA — served from api/public/admin/ at /admin/
// index.html is never cached so browsers always pick up new hashed asset filenames.
// JS/CSS filenames contain content hashes so they can be cached indefinitely.
await app.register(staticFiles, {
  root: join(__dir, '../public/admin'),
  prefix: '/admin/',
  decorateReply: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  },
})

// Redirect root and bare /admin to the admin UI
app.get('/', async (_req, reply) => reply.redirect('/admin/'))
app.get('/admin', async (_req, reply) => reply.redirect('/admin/'))

// Auth middleware on all /v1/ routes
app.addHook('onRequest', authMiddleware)

// Favicon
app.get('/favicon.ico', async (request, reply) => {
  return reply.code(204).send()
})

// Routes
await app.register(statusRoutes, { prefix: '/v1' })
await app.register(userRoutes, { prefix: '/v1' })
await app.register(libraryRoutes, { prefix: '/v1' })
await app.register(historyRoutes, { prefix: '/v1' })
await app.register(sessionRoutes, { prefix: '/v1' })
await app.register(adminSettingsRoutes, { prefix: '/v1/admin' })
await app.register(adminApiKeyRoutes, { prefix: '/v1/admin' })
await app.register(adminUserRoutes, { prefix: '/v1/admin' })
await app.register(adminMaintenanceRoutes, { prefix: '/v1/admin' })
await app.register(adminImportRoutes, { prefix: '/v1/admin' })

// Health check (no auth)
app.get('/health', async () => ({ status: 'ok' }))

async function firstRunSetup(): Promise<void> {
  const existing = await db.select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.tier, 'admin'))
    .limit(1)

  if (existing.length > 0) return

  const rawKey = `sk_admin_${randomBytes(24).toString('hex')}`
  const keyHash = await bcrypt.hash(rawKey, 10)
  const keyPrefix = rawKey.slice(0, 16)
  const now = Math.floor(Date.now() / 1000)

  await db.insert(apiKeys).values({
    keyHash,
    keyPrefix,
    label: 'Admin (auto-generated)',
    tier: 'admin',
    createdAt: now,
  })

  // Box width driven by key length: 2 leading spaces + key + 2 trailing spaces
  const innerWidth = rawKey.length + 4
  const bar = '═'.repeat(innerWidth)
  const line = (s: string) => `║  ${s.padEnd(innerWidth - 2)}║`
  const blank = `║${' '.repeat(innerWidth)}║`

  const banner = [
    `╔${bar}╗`,
    line('SENTINEL FIRST RUN — ADMIN KEY'),
    blank,
    line(rawKey),
    blank,
    line('Save this key — it will never be shown again.'),
    line('Use it to log into the admin UI at /admin'),
    `╚${bar}╝`,
  ].join('\n')

  process.stdout.write('\n' + banner + '\n\n')

  // Also append to the shared log volume so /v1/admin/logs surfaces it
  const logPath = process.env.LOG_PATH ?? '/data/logs/collector.log'
  try {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    fs.appendFileSync(logPath, `[${ts}] [INFO] First-run admin key generated:\n${banner}\n`)
  } catch { /* log volume may not be mounted yet — stdout is sufficient */ }
}

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`[Sentinel API] Listening on port ${PORT}`)
  await firstRunSetup()
} catch (err) {
  app.log.error(err)
  process.exit(1)
}