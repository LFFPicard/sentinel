import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticFiles from '@fastify/static'
import websocket from '@fastify/websocket'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
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

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`[Sentinel API] Listening on port ${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}