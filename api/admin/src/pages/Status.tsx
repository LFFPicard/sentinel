import { useEffect, useState, useCallback } from 'react'
import { api, type StatusData } from '../api/client'
import { formatBytes, n, timeAgo } from '../utils'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-atrium-surface border border-atrium-border rounded-lg p-4">
      <div className="text-atrium-muted text-xs uppercase tracking-wider mb-1.5">{label}</div>
      <div className="text-2xl font-semibold text-atrium-text tabular-nums">
        {typeof value === 'number' ? n(value) : value}
      </div>
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) return <span className="inline-block w-2 h-2 rounded-full bg-atrium-dim" />
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-atrium-success' : 'bg-atrium-error'}`}
    />
  )
}

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api.status.get()
      setData(d)
      setUpdatedAt(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const collector = data?.collector

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-atrium-text">Status</h1>
          <p className="text-atrium-muted text-sm mt-0.5">
            {updatedAt ? `Updated ${timeAgo(Math.floor(updatedAt.getTime() / 1000))}` : 'Loading…'}
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-atrium-muted border border-atrium-border rounded hover:text-atrium-text hover:border-atrium-muted transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 text-atrium-error text-sm bg-atrium-error/10 border border-atrium-error/20 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* DB record counts */}
      <h2 className="text-xs font-medium text-atrium-muted uppercase tracking-wider mb-3">
        Database Records
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sessions" value={data?.database.sessions ?? '—'} />
        <StatCard label="Users"    value={data?.database.users    ?? '—'} />
        <StatCard label="Metadata" value={data?.database.metadata ?? '—'} />
        <StatCard label="Libraries" value={data?.database.libraries ?? '—'} />
      </div>

      {/* Lower row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Collector */}
        <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-atrium-text">Collector</h2>
            <StatusDot ok={collector?.connected} />
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-atrium-muted">Connection</dt>
              <dd className={collector?.connected ? 'text-atrium-success' : collector === undefined ? 'text-atrium-dim' : 'text-atrium-error'}>
                {collector === undefined ? 'Unknown' : collector.connected ? 'Connected' : 'Disconnected'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-atrium-muted">Active streams</dt>
              <dd className="text-atrium-text tabular-nums">
                {collector?.activeSessions ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-atrium-muted">Last event</dt>
              <dd className="text-atrium-text text-xs text-right max-w-[120px] truncate" title={collector?.lastEvent}>
                {collector?.lastEvent ?? '—'}
              </dd>
            </div>
            {collector?.lastEventAt && (
              <div className="flex justify-between">
                <dt className="text-atrium-muted">Received</dt>
                <dd className="text-atrium-text text-xs">{timeAgo(collector.lastEventAt)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Plex */}
        <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-atrium-text mb-4">Plex Server</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-atrium-muted">Name</dt>
              <dd className="text-atrium-text truncate max-w-[140px]" title={data?.plex.serverName}>
                {data?.plex.serverName ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-atrium-muted">Version</dt>
              <dd className="text-atrium-text">{data?.plex.version ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-atrium-muted">URL</dt>
              <dd className="text-atrium-text text-xs truncate max-w-[140px]" title={data?.plex.url ?? undefined}>
                {data?.plex.url ?? 'Not configured'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Instance */}
        <div className="bg-atrium-surface border border-atrium-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-atrium-text mb-4">Instance</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-atrium-muted">API version</dt>
              <dd className="text-atrium-text">{data?.version ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-atrium-muted">API status</dt>
              <dd className={data ? 'text-atrium-success' : 'text-atrium-dim'}>
                {data ? 'OK' : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-atrium-muted">DB size</dt>
              <dd className="text-atrium-text">
                {data?.database.sizeBytes != null ? formatBytes(data.database.sizeBytes) : '—'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
