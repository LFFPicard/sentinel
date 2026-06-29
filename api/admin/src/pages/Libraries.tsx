import { useEffect, useState } from 'react'
import { api, type LibraryRecord } from '../api/client'
import { n } from '../utils'

const TYPE_LABELS: Record<string, string> = {
  movie: 'Movies',
  show:  'TV Shows',
  music: 'Music',
  photo: 'Photos',
}

export default function Libraries() {
  const [libraries, setLibraries] = useState<LibraryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<LibraryRecord | null>(null)
  const [removing, setRemoving] = useState(false)

  async function load() {
    try {
      const d = await api.libraries.list()
      setLibraries(d.libraries)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load libraries')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await api.libraries.remove(removeTarget.id)
      setRemoveTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove library')
      setRemoveTarget(null)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-atrium-text mb-1">Libraries</h1>
      <p className="text-atrium-muted text-sm mb-6">
        Plex libraries synced to Sentinel. Removing a library deletes all associated history.
      </p>

      {error && (
        <div className="mb-5 text-atrium-error text-sm bg-atrium-error/10 border border-atrium-error/20 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-atrium-surface border border-atrium-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-atrium-muted text-sm">Loading…</div>
        ) : libraries.length === 0 ? (
          <div className="p-6 text-atrium-muted text-sm">
            No libraries synced yet. The collector syncs library data from Plex every 6 hours.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-atrium-border">
                <th className="text-left px-5 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Library
                </th>
                <th className="text-left px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Type
                </th>
                <th className="text-right px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Metadata items
                </th>
                <th className="text-left px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Plex key
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-atrium-border">
              {libraries.map(lib => (
                <tr key={lib.id} className="hover:bg-atrium-elevated/50 transition-colors">
                  <td className="px-5 py-3.5 text-atrium-text font-medium">{lib.name}</td>
                  <td className="px-4 py-3.5 text-atrium-muted">
                    {TYPE_LABELS[lib.type] ?? lib.type}
                  </td>
                  <td className="px-4 py-3.5 text-right text-atrium-text tabular-nums">
                    {n(lib.metadataCount ?? 0)}
                  </td>
                  <td className="px-4 py-3.5 text-atrium-dim font-mono text-xs">{lib.plexKey}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => setRemoveTarget(lib)}
                      className="text-xs text-atrium-muted hover:text-atrium-error transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Remove confirm modal */}
      {removeTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-atrium-surface border border-atrium-border rounded-lg p-6 w-full max-w-sm mx-4">
            <h3 className="text-atrium-text font-semibold mb-2">Remove library?</h3>
            <p className="text-atrium-muted text-sm mb-1">
              <span className="text-atrium-text font-medium">{removeTarget.name}</span> and all
              associated play history will be permanently deleted.
            </p>
            <p className="text-atrium-error text-xs mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 px-4 py-2 border border-atrium-border text-atrium-muted text-sm rounded hover:text-atrium-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 px-4 py-2 bg-atrium-error text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
