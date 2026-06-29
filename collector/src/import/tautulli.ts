import Database from 'better-sqlite3'
import { db } from '../db/index.js'
import { users, metadata, libraries, sessionHistory, importJobs } from '@sentinel/shared/src/schema'
import { eq, sql } from '@sentinel/shared/src/schema'
import { log } from '../logger.js'

const BATCH_SIZE = 500
const IMPORT_PATH = process.env.IMPORT_PATH ?? '/import/tautulli.db'

type TautulliSession = {
  id: number
  started: number
  stopped: number
  paused_counter: number
  user: string
  user_id: number
  rating_key: number
  ip_address: string
  player: string
  product: string
  platform: string
  quality_profile: string
  section_id: number
  title: string
  parent_title: string
  grandparent_title: string
  grandparent_rating_key: number
  parent_rating_key: number
  media_type: string
  year: number
  thumb: string
  art: string
  duration: number
  content_rating: string
  summary: string
  genres: string
  studio: string
  transcode_decision: string
  video_decision: string
  audio_decision: string
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function toIntStr(v: unknown): string | null {
  const n = toInt(v)
  return n !== null ? String(n) : null
}

export async function runTautulliImport(jobId: number) {
  const now = () => Math.floor(Date.now() / 1000)

  log.info('[Import] Starting Tautulli import...')

  // Open SQLite
  let tautulli: Database.Database
  try {
    tautulli = new Database(IMPORT_PATH, { readonly: true })
  } catch (err) {
    log.error(`[Import] Failed to open tautulli.db: ${err instanceof Error ? err.message : String(err)}`)
    await db.update(importJobs)
      .set({ status: 'failed', errorLog: String(err), completedAt: now() })
      .where(eq(importJobs.id, jobId))
    return
  }

  // Count total records
  const countRow = tautulli.prepare('SELECT COUNT(*) as count FROM session_history').get() as { count: number }
  const total = countRow.count
  const skippedCountRow = tautulli.prepare('SELECT COUNT(*) as count FROM session_history WHERE stopped IS NULL OR stopped = 0').get() as { count: number }

  log.info(`[Import] Found ${total} records to import`)

  const jobStartedAt = now()
  await db.update(importJobs)
    .set({ status: 'running', total, startedAt: jobStartedAt })
    .where(eq(importJobs.id, jobId))

  // Cache for user and metadata IDs to avoid repeat lookups
  const userCache = new Map<string, number>()
  const metadataCache = new Map<number, number>()
  const libraryCache = new Map<number, number>()

  let processed = 0
  let errors = 0
  const errorLines: string[] = []
  let skipped = skippedCountRow.count
  let metadataLinked = 0
  let usersCreated = 0

  // Process in batches
  const stmt = tautulli.prepare(`
    SELECT 
      sh.id, sh.started, sh.stopped, sh.paused_counter,
      sh.user, sh.user_id, sh.rating_key, sh.ip_address,
      sh.player, sh.product, sh.platform, sh.quality_profile,
      sh.section_id, sh.grandparent_rating_key, sh.parent_rating_key,
      shm.title, shm.parent_title, shm.grandparent_title,
      shm.media_type, shm.year, shm.thumb, shm.art,
      shm.duration, shm.content_rating, shm.summary,
      shm.genres, shm.studio,
      shmi.transcode_decision, shmi.video_decision, shmi.audio_decision
    FROM session_history sh
    LEFT JOIN session_history_metadata shm ON sh.id = shm.id
    LEFT JOIN session_history_media_info shmi ON sh.id = shmi.id
    WHERE sh.stopped IS NOT NULL AND sh.stopped > 0
    ORDER BY sh.id ASC
    LIMIT ? OFFSET ?
  `)

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const rows = stmt.all(BATCH_SIZE, offset) as TautulliSession[]

    for (const row of rows) {
      try {
        // Resolve user — key by user_id (stable) not username (may be email or change)
        let userId: number | null = null
        const plexId = `tautulli_${row.user_id}`
        const cacheKey = String(row.user_id)

        if (userCache.has(cacheKey)) {
          userId = userCache.get(cacheKey)!
        } else {
          const existing = await db.select()
            .from(users)
            .where(eq(users.plexId, plexId))
            .limit(1)

          if (existing.length > 0) {
            userId = existing[0].id
          } else {
            const inserted = await db.insert(users).values({
              plexId,
              username: row.user ?? `unknown_${row.user_id}`,
              createdAt: now(),
              updatedAt: now(),
            }).returning({ id: users.id })
            userId = inserted[0].id
            usersCreated++
          }
          userCache.set(cacheKey, userId!)
        }

        // Resolve metadata
        let metadataId: number | null = null
        const ratingKey = row.rating_key

        if (metadataCache.has(ratingKey)) {
          metadataId = metadataCache.get(ratingKey)!
        } else {
          if (row.title) {
            // Resolve library
            let libraryId: number | null = null
            const sectionId = toInt(row.section_id)
            if (sectionId !== null) {
              if (libraryCache.has(sectionId)) {
                libraryId = libraryCache.get(sectionId)!
              } else {
                const lib = await db.select()
                  .from(libraries)
                  .where(eq(libraries.plexKey, String(sectionId)))
                  .limit(1)
                if (lib.length > 0) {
                  libraryId = lib[0].id
                  libraryCache.set(sectionId, libraryId!)
                }
              }
            }

            // INSERT ... ON CONFLICT (rating_key) DO UPDATE RETURNING id
            // DO UPDATE (not DO NOTHING) guarantees RETURNING always yields the row —
            // whether inserted fresh or already existed after a previous partial run.
            // Eliminates the second SELECT round-trip and the ~64k error cascade.
            const result = await db.insert(metadata).values({
              ratingKey: String(ratingKey),
              parentKey: toIntStr(row.parent_rating_key),
              grandparentKey: toIntStr(row.grandparent_rating_key),
              libraryId,
              type: row.media_type ?? 'movie',
              title: row.title,
              parentTitle: row.parent_title ?? null,
              grandparentTitle: row.grandparent_title ?? null,
              year: toInt(row.year),
              thumb: row.thumb ?? null,
              art: row.art ?? null,
              duration: toInt(row.duration),
              contentRating: row.content_rating ?? null,
              summary: row.summary ?? null,
              studio: row.studio ?? null,
              createdAt: now(),
              updatedAt: now(),
            }).onConflictDoUpdate({
              target: metadata.ratingKey,
              set: { updatedAt: sql`EXCLUDED.updated_at` },
            }).returning({ id: metadata.id })

            metadataId = result[0].id
            metadataCache.set(ratingKey, metadataId)
          } else {
            // No title to insert — look up any existing record cached by the live
            // collector's syncMetadata job or a previous import run
            const found = await db.select({ id: metadata.id })
              .from(metadata)
              .where(eq(metadata.ratingKey, String(ratingKey)))
              .limit(1)

            if (found.length > 0) {
              metadataId = found[0].id
              metadataCache.set(ratingKey, metadataId)
            }
          }
        }

        // Calculate watch duration
        const watchDuration = Math.max(0,
          (row.stopped - row.started) - (row.paused_counter ?? 0)
        )
        const mediaDuration = row.duration ? row.duration / 1000 : null
        const complete = mediaDuration
          ? watchDuration >= mediaDuration * 0.9
          : false

        const year = new Date(row.started * 1000).getFullYear()

        // Insert session
        await db.insert(sessionHistory).values({
          userId,
          metadataId,
          sessionKey: `tautulli_${row.id}`,
          startedAt: row.started,
          stoppedAt: row.stopped,
          duration: watchDuration,
          progress: null,
          complete,
          platform: row.product ?? row.platform ?? null,
          player: row.player ?? null,
          ipAddress: row.ip_address ?? null,
          transcodeDecision: row.transcode_decision ?? null,
          videoDecision: row.video_decision ?? null,
          audioDecision: row.audio_decision ?? null,
          qualityProfile: row.quality_profile ?? null,
          imported: true,
          year,
        })

        if (metadataId !== null) metadataLinked++
        processed++
      } catch (err: any) {
        errors++
        const cause = err?.cause?.message ?? err?.message ?? String(err)
        const msg = `Row ${row.id}: ${cause}`
        errorLines.push(msg)
        if (errorLines.length > 100) errorLines.shift()
        log.error(`[Import] ${msg}`)
      }
    }

    // Update progress after each batch
    await db.update(importJobs)
      .set({
        processed,
        errors,
        errorLog: errorLines.join('\n'),
      })
      .where(eq(importJobs.id, jobId))

    log.info(`[Import] Progress: ${processed}/${total} (${Math.round(processed/total*100)}%)`)
  }

  // Complete
  const completedAt = now()
  const durationSeconds = completedAt - jobStartedAt
  const summary = JSON.stringify({
    total,
    imported: processed,
    skipped,
    errors,
    metadataLinked,
    usersCreated,
    durationSeconds,
  })
  const finalLog = errorLines.length > 0
    ? errorLines.join('\n') + '\n---\n' + summary
    : summary

  await db.update(importJobs)
    .set({
      status: errors === total ? 'failed' : 'complete',
      processed,
      errors,
      errorLog: finalLog,
      completedAt,
    })
    .where(eq(importJobs.id, jobId))

  tautulli.close()
  log.info(`[Import] Complete — ${processed} imported, ${skipped} skipped, ${errors} errors, ${usersCreated} users created, ${durationSeconds}s`)
}