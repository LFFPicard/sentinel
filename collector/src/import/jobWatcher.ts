import { db } from '../db/index.js'
import { importJobs } from '@sentinel/shared/src/schema'
import { eq } from '@sentinel/shared/src/schema'
import { runTautulliImport } from './tautulli.js'
import { log } from '../logger.js'
import fs from 'fs'


const IMPORT_PATH = process.env.IMPORT_PATH ?? '/import/tautulli.db'
let running = false

export function startJobWatcher() {
  // Check every 10 seconds for pending import jobs
  setInterval(async () => {
    if (running) return

    const pending = await db.select()
      .from(importJobs)
      .where(eq(importJobs.status, 'pending'))
      .limit(1)

    if (pending.length === 0) return

    const job = pending[0]

    if (!fs.existsSync(IMPORT_PATH)) {
      log.error(`[JobWatcher] Import triggered but tautulli.db not found at ${IMPORT_PATH}`)
      await db.update(importJobs)
        .set({ status: 'failed', errorLog: 'tautulli.db not found in /import volume' })
        .where(eq(importJobs.id, job.id))
      return
    }

    running = true
    try {
      await runTautulliImport(job.id)
    } finally {
      running = false
    }
  }, 10000)

  log.info('[JobWatcher] Started — watching for import jobs')
}