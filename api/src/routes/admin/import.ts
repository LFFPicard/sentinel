import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../db.js'
import { importJobs, settings } from '@sentinel/shared/src/schema'
import { eq, desc } from 'drizzle-orm'
import { requireAdmin } from '../../auth.js'
import fs from 'fs'

const IMPORT_PATH = process.env.IMPORT_PATH ?? '/import/tautulli.db'

export async function adminImportRoutes(app: FastifyInstance) {
  // Check if file exists + get record count estimate
  app.get('/import/status', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return

    const fileExists = fs.existsSync(IMPORT_PATH)
    const fileSize = fileExists ? fs.statSync(IMPORT_PATH).size : null

    // Get latest job
    const jobs = await db.select()
      .from(importJobs)
      .orderBy(desc(importJobs.createdAt))
      .limit(1)

    return {
      fileDetected: fileExists,
      fileSizeBytes: fileSize,
      latestJob: jobs[0] ?? null,
    }
  })

  // Trigger import
  app.post('/import/tautulli', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return

    // Check no job already running
    const running = await db.select()
      .from(importJobs)
      .where(eq(importJobs.status, 'running'))
      .limit(1)

    if (running.length > 0) {
      return reply.code(409).send({ error: 'Import already running' })
    }

    const now = Math.floor(Date.now() / 1000)

    const inserted = await db.insert(importJobs).values({
      source: 'tautulli',
      status: 'pending',
      createdAt: now,
    }).returning({ id: importJobs.id })

    return {
      jobId: inserted[0].id,
      message: 'Import job queued — collector will pick it up within 10 seconds',
    }
  })
}