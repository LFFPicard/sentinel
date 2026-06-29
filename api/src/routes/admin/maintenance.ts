import { FastifyInstance } from 'fastify'
import fs from 'fs'
import { pool } from '../../db.js'
import { requireAdmin } from '../../auth.js'

function bytesToHuman(bytes: number): string {
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

export async function adminMaintenanceRoutes(app: FastifyInstance) {
  app.get('/maintenance/status', async (request, reply) => {
    if (!requireAdmin(request, reply)) return

    const [sizeResult, tableResult, vacuumResult] = await Promise.all([
      pool.query<{ size_bytes: string }>(
        'SELECT pg_database_size(current_database()) AS size_bytes',
      ),
      pool.query<{ relname: string; count: string }>(
        'SELECT relname, n_live_tup::bigint AS count FROM pg_stat_user_tables ORDER BY relname',
      ),
      pool.query<{ last_vacuum: string | null }>(
        `SELECT GREATEST(last_vacuum, last_autovacuum)::text AS last_vacuum
         FROM pg_stat_user_tables WHERE relname = 'session_history'`,
      ),
    ])

    const dbSizeBytes = parseInt(sizeResult.rows[0]?.size_bytes ?? '0', 10)
    const tableCounts: Record<string, number> = Object.fromEntries(
      tableResult.rows.map(r => [r.relname, parseInt(r.count, 10)]),
    )

    return {
      dbSizeBytes,
      dbSizePretty: bytesToHuman(dbSizeBytes),
      lastVacuum: vacuumResult.rows[0]?.last_vacuum ?? null,
      tableCounts,
    }
  })

  app.post('/maintenance/vacuum', async (request, reply) => {
    if (!requireAdmin(request, reply)) return

    await pool.query('VACUUM ANALYZE')
    return { success: true }
  })

  app.delete<{ Querystring: { before: string } }>('/history', async (request, reply) => {
    if (!requireAdmin(request, reply)) return

    const before = parseInt(request.query.before, 10)
    if (Number.isNaN(before)) return reply.code(400).send({ error: 'before must be a unix timestamp' })

    const result = await pool.query(
      'DELETE FROM session_history WHERE started_at < $1',
      [before],
    )

    return { deleted: result.rowCount ?? 0 }
  })

  app.get('/logs', async (request, reply) => {
    if (!requireAdmin(request, reply)) return

    const logPath = process.env.LOG_PATH ?? '/data/logs/collector.log'
    try {
      const content = fs.readFileSync(logPath, 'utf8')
      const lines = content.split('\n').filter(l => l.trim() !== '').slice(-100)
      return { lines }
    } catch {
      return { lines: [] as string[] }
    }
  })

  app.delete('/reset', async (request, reply) => {
    if (!requireAdmin(request, reply)) return

    // Truncate all user data in one statement — PostgreSQL handles FK ordering
    // across the three tables automatically. Libraries are preserved.
    await pool.query('TRUNCATE TABLE session_history, metadata, users')
    await pool.query(
      "UPDATE import_jobs SET status = 'failed', error_log = 'Reset by admin' WHERE status IN ('pending', 'running')",
    )

    return { success: true }
  })
}
