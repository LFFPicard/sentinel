import { useEffect, useState } from 'react'
import { api, type MaintenanceInfo } from '../api/client'
import { formatBytes, n } from '../utils'

export default function Maintenance() {
  const [info, setInfo] = useState<MaintenanceInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)

  // VACUUM
  const [vacuuming, setVacuuming] = useState(false)
  const [vacuumMsg, setVacuumMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // History cleanup
  const [cleanupDate, setCleanupDate] = useState('')
  const [cleaning, setCleaning] = useState(false)
  const [cleanupMsg, setCleanupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [cleanupConfirm, setCleanupConfirm] = useState(false)

  // Log viewer
  const [logs, setLogs] = useState<string[]>([])
  const [logsError, setLogsError] = useState<string | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Nuke / reset
  const [showNukeConfirm, setShowNukeConfirm] = useState(false)
  const [nukeInput, setNukeInput] = useState('')
  const [nuking, setNuking] = useState(false)
  const [nukeMsg, setNukeMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api.maintenance
      .status()
      .then(d => setInfo(d))
      .catch(err => setInfoError(err instanceof Error ? err.message : 'Failed to load'))
  }, [])

  async function handleVacuum() {
    setVacuuming(true)
    setVacuumMsg(null)
    try {
      await api.maintenance.vacuum()
      setVacuumMsg({ ok: true, text: 'VACUUM ANALYZE complete.' })
      const d = await api.maintenance.status()
      setInfo(d)
    } catch (err) {
      setVacuumMsg({ ok: false, text: err instanceof Error ? err.message : 'VACUUM failed.' })
    } finally {
      setVacuuming(false)
    }
  }

  async function handleCleanup() {
    if (!cleanupDate) return
    setCleaning(true)
    setCleanupMsg(null)
    setCleanupConfirm(false)
    try {
      const d = await api.maintenance.cleanup(cleanupDate)
      setCleanupMsg({
        ok: true,
        text: `Deleted ${d.deleted.toLocaleString()} records before ${cleanupDate}.`,
      })
    } catch (err) {
      setCleanupMsg({ ok: false, text: err instanceof Error ? err.message : 'Cleanup failed.' })
    } finally {
      setCleaning(false)
    }
  }

  async function handleReset() {
    if (nukeInput !== 'RESET') return
    setNuking(true)
    setNukeMsg(null)
    try {
      await api.maintenance.reset()
      setNukeMsg({ ok: true, text: 'Reset complete. All session history, metadata, and users have been deleted.' })
      setShowNukeConfirm(false)
      setNukeInput('')
      const d = await api.maintenance.status()
      setInfo(d)
    } catch (err) {
      setNukeMsg({ ok: false, text: err instanceof Error ? err.message : 'Reset failed.' })
    } finally {
      setNuking(false)
    }
  }

  async function loadLogs() {
    setLoadingLogs(true)
    setLogsError(null)
    try {
      const d = await api.maintenance.logs()
      setLogs(d.lines)
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Failed to load logs')
    } finally {
      setLoadingLogs(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-atrium-text mb-1">Maintenance</h1>
        <p className="text-atrium-muted text-sm">Database housekeeping and diagnostics.</p>
      </div>

      {/* DB info */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-atrium-text mb-4">Database</h2>
        {infoError ? (
          <p className="text-atrium-error text-sm">{infoError}</p>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-atrium-muted text-xs mb-0.5">Size on disk</dt>
              <dd className="text-atrium-text font-medium">
                {info?.dbSizePretty ?? (info?.dbSizeBytes != null ? formatBytes(info.dbSizeBytes) : '—')}
              </dd>
            </div>
            <div>
              <dt className="text-atrium-muted text-xs mb-0.5">Last vacuum</dt>
              <dd className="text-atrium-text font-medium">{info?.lastVacuum ?? '—'}</dd>
            </div>
            {info?.tableCounts &&
              Object.entries(info.tableCounts).map(([table, count]) => (
                <div key={table}>
                  <dt className="text-atrium-muted text-xs mb-0.5">{table}</dt>
                  <dd className="text-atrium-text font-medium tabular-nums">{n(count)}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>

      {/* VACUUM */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-atrium-text mb-1">VACUUM ANALYZE</h2>
        <p className="text-atrium-muted text-xs mb-4">
          Reclaims storage and updates query planner statistics. Safe to run at any time; may
          take a few seconds on large databases.
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={handleVacuum}
            disabled={vacuuming}
            className="px-4 py-2 bg-atrium-accent text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {vacuuming ? 'Running…' : 'Run VACUUM'}
          </button>
          {vacuumMsg && (
            <span className={`text-sm ${vacuumMsg.ok ? 'text-atrium-success' : 'text-atrium-error'}`}>
              {vacuumMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* History cleanup */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-atrium-text mb-1">Bulk History Cleanup</h2>
        <p className="text-atrium-muted text-xs mb-4">
          Permanently delete all play history records before a given date. Use to free space or
          remove stale imported data.
        </p>
        <div className="flex items-end gap-3 mb-3">
          <div>
            <label className="block text-atrium-muted text-xs uppercase tracking-wider mb-2">
              Delete records before
            </label>
            <input
              type="date"
              value={cleanupDate}
              onChange={e => { setCleanupDate(e.target.value); setCleanupConfirm(false) }}
              className="bg-atrium-elevated border border-atrium-border rounded px-3 py-2 text-atrium-text text-sm focus:outline-none focus:border-atrium-accent transition-colors"
            />
          </div>
          {!cleanupConfirm ? (
            <button
              onClick={() => setCleanupConfirm(true)}
              disabled={!cleanupDate || cleaning}
              className="px-4 py-2 border border-atrium-error text-atrium-error text-sm rounded hover:bg-atrium-error/10 transition-colors disabled:opacity-40"
            >
              Delete
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setCleanupConfirm(false)}
                className="px-3 py-2 border border-atrium-border text-atrium-muted text-sm rounded hover:text-atrium-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCleanup}
                disabled={cleaning}
                className="px-3 py-2 bg-atrium-error text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40"
              >
                {cleaning ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          )}
        </div>
        {cleanupMsg && (
          <p className={`text-sm ${cleanupMsg.ok ? 'text-atrium-success' : 'text-atrium-error'}`}>
            {cleanupMsg.text}
          </p>
        )}
      </div>

      {/* Log viewer */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-atrium-text">Collector Logs</h2>
            <p className="text-atrium-muted text-xs mt-0.5">Last 100 lines from the collector process.</p>
          </div>
          <button
            onClick={loadLogs}
            disabled={loadingLogs}
            className="px-3 py-1.5 text-sm border border-atrium-border text-atrium-muted rounded hover:text-atrium-text transition-colors disabled:opacity-40"
          >
            {loadingLogs ? 'Loading…' : logs.length ? 'Refresh' : 'Load logs'}
          </button>
        </div>

        {logsError && (
          <p className="text-atrium-error text-sm mb-3">{logsError}</p>
        )}

        {logs.length > 0 && (
          <pre className="bg-atrium-elevated border border-atrium-border rounded p-3 text-xs text-atrium-muted overflow-auto max-h-72 font-mono whitespace-pre-wrap leading-relaxed">
            {logs.join('\n')}
          </pre>
        )}

        {logs.length === 0 && !logsError && !loadingLogs && (
          <p className="text-atrium-dim text-sm">Click "Load logs" to fetch recent collector output.</p>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-atrium-surface border border-atrium-error/30 rounded-lg p-5">
        <h2 className="text-sm font-medium text-atrium-error mb-1">Danger Zone</h2>
        <p className="text-atrium-muted text-xs mb-4">
          Permanently deletes all session history, metadata, and user records. Active and pending
          import jobs are marked as failed. Libraries are preserved. This cannot be undone.
        </p>

        {!showNukeConfirm ? (
          <button
            onClick={() => { setShowNukeConfirm(true); setNukeMsg(null) }}
            disabled={nuking}
            className="px-4 py-2 border border-atrium-error text-atrium-error text-sm rounded hover:bg-atrium-error/10 transition-colors disabled:opacity-40"
          >
            Reset Database
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-atrium-warning text-xs font-medium">
              Type <span className="font-mono font-bold text-atrium-text">RESET</span> to confirm.
              All data will be permanently deleted.
            </p>
            <input
              type="text"
              value={nukeInput}
              onChange={e => setNukeInput(e.target.value)}
              placeholder="Type RESET to confirm"
              className="block bg-atrium-elevated border border-atrium-error/50 rounded px-3 py-2 text-atrium-text text-sm focus:outline-none focus:border-atrium-error transition-colors w-64"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowNukeConfirm(false); setNukeInput('') }}
                className="px-3 py-2 border border-atrium-border text-atrium-muted text-sm rounded hover:text-atrium-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={nuking || nukeInput !== 'RESET'}
                className="px-3 py-2 bg-atrium-error text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {nuking ? 'Resetting…' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        )}

        {nukeMsg && (
          <p className={`text-sm mt-3 ${nukeMsg.ok ? 'text-atrium-success' : 'text-atrium-error'}`}>
            {nukeMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}
