import { useEffect, useRef, useState } from 'react'
import { api, type ImportJob } from '../api/client'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

interface ImportSummary {
  total: number
  imported: number
  skipped: number
  errors: number
  metadataLinked: number
  usersCreated: number
  durationSeconds: number
}

function parseSummary(log: string | null): ImportSummary | null {
  if (!log) return null
  const sep = log.lastIndexOf('\n---\n')
  const jsonStr = sep >= 0 ? log.slice(sep + 5) : log
  try { return JSON.parse(jsonStr) as ImportSummary } catch { return null }
}

// Returns only the human-readable error lines, stripping the JSON summary appended after
// '\n---\n'. Returns null when the field contains only the summary (no actual errors logged).
function parseErrorLines(log: string | null): string | null {
  if (!log) return null
  const sep = log.lastIndexOf('\n---\n')
  if (sep < 0) return null  // whole string is just the JSON summary — nothing to show
  const lines = log.slice(0, sep).trim()
  return lines || null
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-atrium-muted mb-1.5">
        <span>
          Processed {value.toLocaleString()} / {max.toLocaleString()} records ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-atrium-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-atrium-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function jobStatusColor(status: ImportJob['status']) {
  if (status === 'complete') return 'text-atrium-success'
  if (status === 'failed') return 'text-atrium-error'
  if (status === 'running') return 'text-atrium-accent'
  return 'text-atrium-warning'
}

export default function Import() {
  const [job, setJob] = useState<ImportJob | null>(null)
  const [fileDetected, setFileDetected] = useState<boolean | undefined>(undefined)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Exposed so handleTrigger can restart the loop after kicking off a job
  const pollRef = useRef<() => void>(() => {})
  const mountedRef = useRef(false)

  const isActive = job?.status === 'pending' || job?.status === 'running'

  // Tick every second while active so elapsed time updates live
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000)
    return () => clearInterval(id)
  }, [isActive])

  useEffect(() => {
    mountedRef.current = true

    async function poll() {
      if (!mountedRef.current) return

      // Clear any pending timer before starting a new fetch cycle
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      const key = localStorage.getItem('sentinel_api_key')
      try {
        const res = await fetch('/v1/admin/import/status', {
          headers: key ? { Authorization: `Bearer ${key}` } : {},
        })

        if (!mountedRef.current) return

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          setFetchError(body.error ?? `HTTP ${res.status}`)
          timerRef.current = setTimeout(poll, 2000)
          return
        }

        const data = await res.json() as { latestJob: ImportJob | null; fileDetected?: boolean }

        setJob(data.latestJob)
        if (data.fileDetected !== undefined) setFileDetected(data.fileDetected)
        setFetchError(null)

        const status = data.latestJob?.status
        if (status === 'pending' || status === 'running') {
          timerRef.current = setTimeout(poll, 2000)
        }
      } catch (err) {
        if (!mountedRef.current) return
        setFetchError(err instanceof Error ? err.message : 'Failed to load import status')
        // Retry on network error after a longer pause
        timerRef.current = setTimeout(poll, 5000)
      }
    }

    pollRef.current = poll
    void poll()

    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const elapsed = job?.startedAt ? now - job.startedAt : null
  const duration =
    job?.startedAt && job?.completedAt ? job.completedAt - job.startedAt : null
  const summary = parseSummary(job?.errorLog ?? null)

  async function handleTrigger() {
    setTriggering(true)
    setTriggerError(null)
    // Synthetic pending job — shows the card immediately before the first poll returns.
    // The trigger endpoint returns { jobId, message } not a full job object, so we
    // don't read d.job here; the poll fetches the real record within 2 seconds.
    setJob({
      id: 0,
      source: 'tautulli',
      status: 'pending',
      total: null,
      processed: 0,
      errors: 0,
      errorLog: null,
      startedAt: null,
      completedAt: null,
      createdAt: Math.floor(Date.now() / 1000),
    })
    try {
      await api.import.trigger()
      void pollRef.current()
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Failed to start import')
      setJob(null)
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-atrium-text mb-1">Tautulli Import</h1>
      <p className="text-atrium-muted text-sm mb-6">
        Migrate your Tautulli history into Sentinel.
      </p>

      {fetchError && (
        <div className="mb-5 text-atrium-error text-sm bg-atrium-error/10 border border-atrium-error/20 px-4 py-3 rounded-lg">
          {fetchError}
        </div>
      )}

      {/* Setup instructions */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5 mb-5">
        <h2 className="text-sm font-medium text-atrium-text mb-3">Setup</h2>
        <ol className="space-y-2 text-sm text-atrium-muted list-decimal list-inside">
          <li>
            Locate your Tautulli database —{' '}
            <span className="text-atrium-text font-mono text-xs">
              ~/.local/share/Tautulli/tautulli.db
            </span>
          </li>
          <li>
            Copy it to the import volume:{' '}
            <span className="text-atrium-text font-mono text-xs">./data/import/tautulli.db</span>
          </li>
          <li>Click Start Import below.</li>
        </ol>
      </div>

      {/* File detection */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-atrium-text">File Detection</h2>
          <div className="flex items-center gap-2 text-sm">
            {fileDetected === undefined ? (
              <span className="text-atrium-dim">Checking…</span>
            ) : fileDetected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-atrium-success" />
                <span className="text-atrium-success">tautulli.db detected</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-atrium-error" />
                <span className="text-atrium-error">No file found at /import/tautulli.db</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Active / completed job — also shows during trigger with synthetic pending record */}
      {job && (
        <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-atrium-text">Import Job #{job.id}</h2>
            <div className="flex items-center gap-2">
              {isActive && (
                <span className="flex items-center gap-1.5 text-xs text-atrium-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-atrium-accent animate-pulse" />
                  Import running…
                </span>
              )}
              <span className={`text-xs font-medium uppercase tracking-wider ${jobStatusColor(job.status)}`}>
                {job.status}
              </span>
            </div>
          </div>

          {isActive && job.total != null && (
            <div className="mb-4">
              <ProgressBar value={job.processed} max={job.total} />
            </div>
          )}

          {isActive && job.total == null && (
            <div className="mb-4 h-2 bg-atrium-elevated rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-atrium-accent rounded-full animate-pulse" />
            </div>
          )}

          <dl className="grid grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <dt className="text-atrium-muted text-xs mb-0.5">Processed</dt>
              <dd className="text-atrium-text font-medium tabular-nums">
                {job.processed.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-atrium-muted text-xs mb-0.5">Total</dt>
              <dd className="text-atrium-text font-medium tabular-nums">
                {job.total?.toLocaleString() ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-atrium-muted text-xs mb-0.5">Errors</dt>
              <dd className={`font-medium tabular-nums ${job.errors > 0 ? 'text-atrium-error' : 'text-atrium-text'}`}>
                {job.errors.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-atrium-muted text-xs mb-0.5">
                {isActive ? 'Elapsed' : 'Duration'}
              </dt>
              <dd className="text-atrium-text font-medium tabular-nums">
                {isActive
                  ? elapsed != null ? formatDuration(elapsed) : '—'
                  : duration != null ? formatDuration(duration) : '—'}
              </dd>
            </div>
          </dl>

          {job.status === 'complete' && (
            <div className="bg-atrium-success/10 border border-atrium-success/20 rounded p-3">
              <p className="text-atrium-success text-sm font-medium mb-3">
                Import complete{duration != null ? ` in ${formatDuration(duration)}` : ''}.
              </p>
              {summary ? (
                <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
                  {(
                    [
                      ['Total', summary.total],
                      ['Imported', summary.imported],
                      ['Skipped', summary.skipped],
                      ['Errors', summary.errors],
                      ['Metadata Linked', summary.metadataLinked],
                      ['Users Created', summary.usersCreated],
                    ] as [string, number][]
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-atrium-muted text-xs mb-0.5">{label}</dt>
                      <dd className={`font-medium tabular-nums ${label === 'Errors' && value > 0 ? 'text-atrium-error' : 'text-atrium-success'}`}>
                        {value.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-atrium-success text-sm">
                  {job.processed.toLocaleString()} records imported
                  {job.errors > 0 ? `, ${job.errors.toLocaleString()} errors` : ''}.
                </p>
              )}
            </div>
          )}

          {job.status === 'failed' && (
            <div className="text-atrium-error text-sm bg-atrium-error/10 border border-atrium-error/20 px-3 py-2 rounded">
              Import failed after {job.processed.toLocaleString()} records
              {job.errors > 0 ? ` — ${job.errors.toLocaleString()} errors` : ''}
              {duration != null ? ` (${formatDuration(duration)})` : ''}.
            </div>
          )}

          {parseErrorLines(job.errorLog ?? null) && (
            <div className="mt-4">
              <p className="text-atrium-muted text-xs uppercase tracking-wider mb-2">Error log</p>
              <pre className="bg-atrium-elevated border border-atrium-border rounded p-3 text-xs text-atrium-error overflow-auto max-h-48 font-mono whitespace-pre-wrap">
                {parseErrorLines(job.errorLog ?? null)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Start button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleTrigger}
          disabled={triggering || isActive || fileDetected === false}
          className="px-5 py-2 bg-atrium-accent text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {triggering ? 'Starting…' : isActive ? 'Import running…' : 'Start Import'}
        </button>
        {triggerError && (
          <span className="text-atrium-error text-sm">{triggerError}</span>
        )}
      </div>
    </div>
  )
}
